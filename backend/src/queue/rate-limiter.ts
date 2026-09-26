import type { Result } from "ioredis";
import { redis } from "../lib/redis";

/**
 * Redis-backed throttling shared by every worker process / instance.
 *
 * A single atomic Lua script hands out *send slots*. For a job it finds the
 * earliest time `t` such that
 *
 *   • t ≥ now and t ≥ nextFree[sender]            (min delay between sends of a sender)
 *   • the sender, campaign and global counters of hour(t) are below their limits
 *
 * then increments those counters for hour(t) and returns t.
 *
 * If the current hour is full, the search simply walks forward hour by hour and
 * *books* the job into the first window that still has room – the counters of
 * that future window are incremented right away, so later jobs see the booking
 * and queue up behind it. Consequences:
 *   - nothing is ever dropped or failed because of a limit,
 *   - jobs keep their order (slots are handed out in pick-up order),
 *   - each job is touched at most twice (reserve → wait in BullMQ's delayed set → send),
 *     so 1000+ jobs due at the same second do not cause a polling storm,
 *   - two workers can never both take the last slot of a window (the script is atomic).
 *
 * Within a future window, the sender's slots are spaced `gap` apart from the
 * window start (count * gap), so booked sends also respect the minimum delay.
 * Counters are keyed by `scope + id + hour`, and expire by themselves.
 */
const SCRIPT = `
local now     = tonumber(ARGV[1])
local gap     = tonumber(ARGV[2])
local H       = 3600000
local limits  = { tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]) }
local prefix  = { ARGV[6], ARGV[7], ARGV[8] }
local curWin  = math.floor(now / H)

local nextFree = tonumber(redis.call('GET', KEYS[1]) or '0')
local t = math.max(now, nextFree)
local firstFull = 0

-- gap-only mode: the job already holds a counted slot in this window (it was
-- delayed, e.g. by a restart) and only needs a fresh position in the sender's gap queue
if ARGV[9] == '1' then
  redis.call('SET', KEYS[1], t + gap, 'PX', gap + H)
  return { t, 0, 0 }
end

for _ = 1, 24 * 90 do
  local w = math.floor(t / H)
  local wStart = w * H
  local counts = {}
  local full = 0
  for i = 1, 3 do
    counts[i] = tonumber(redis.call('GET', prefix[i] .. ':' .. w) or '0')
    if full == 0 and limits[i] > 0 and counts[i] >= limits[i] then full = i end
  end

  if full > 0 then
    if firstFull == 0 then firstFull = full end
    t = (w + 1) * H
  else
    -- sender's next position in this window (keeps the min gap w.r.t. bookings)
    local slot = math.max(t, wStart + counts[1] * gap)
    if math.floor(slot / H) ~= w then
      t = (w + 1) * H
    else
      local reached = 0
      for i = 1, 3 do
        if limits[i] > 0 then
          local key = prefix[i] .. ':' .. w
          local c = redis.call('INCR', key)
          redis.call('PEXPIREAT', key, (w + 2) * H)
          if c == limits[i] and reached == 0 then reached = i end
        end
      end
      if w == curWin then
        redis.call('SET', KEYS[1], slot + gap, 'PX', gap + H)
      end
      return { slot, firstFull, reached }
    end
  end
end
return { -1, firstFull, 0 }
`;

redis.defineCommand("reserveSendSlot", { numberOfKeys: 1, lua: SCRIPT });

declare module "ioredis" {
  interface RedisCommander<Context> {
    reserveSendSlot(
      nextFreeKey: string,
      now: number,
      gapMs: number,
      senderLimit: number,
      campaignLimit: number,
      globalLimit: number,
      senderPrefix: string,
      campaignPrefix: string,
      globalPrefix: string,
      gapOnly: 0 | 1,
    ): Result<[number, number, number], Context>;
  }
}

export type LimitScope = "sender" | "campaign" | "global";
const SCOPES: LimitScope[] = ["sender", "campaign", "global"];

export interface Reservation {
  /** Epoch ms at which the job may send. */
  slotAt: number;
  /** Set when the job was pushed past a full hour window (first full limit found). */
  limitedBy: LimitScope | null;
  /** Set when this reservation used the last slot of a window. */
  reachedScope: LimitScope | null;
}

export interface ReserveInput {
  senderId: string;
  campaignId: string;
  gapMs: number;
  senderLimit: number;
  campaignLimit: number;
  /** 0 = disabled */
  globalLimit: number;
  now?: number;
  /** Only take a new position in the sender's min-gap queue; don't touch the hourly counters. */
  gapOnly?: boolean;
}

export async function reserveSendSlot(input: ReserveInput): Promise<Reservation> {
  const now = input.now ?? Date.now();
  const [slotAt, full, reached] = await redis.reserveSendSlot(
    `rl:next:${input.senderId}`,
    now,
    input.gapMs,
    input.senderLimit,
    input.campaignLimit,
    input.globalLimit,
    `rl:sender:${input.senderId}`,
    `rl:campaign:${input.campaignId}`,
    `rl:global:all`,
    input.gapOnly ? 1 : 0,
  );
  if (slotAt < 0) throw new Error("no send slot available in the next 90 days");
  return {
    slotAt,
    limitedBy: full > 0 ? SCOPES[full - 1] : null,
    reachedScope: reached > 0 ? SCOPES[reached - 1] : null,
  };
}
