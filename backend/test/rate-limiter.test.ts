import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserveSendSlot, type ReserveInput } from "../src/queue/rate-limiter";
import { HOUR_MS, hourWindowStart } from "../src/lib/time";
import { closeAll, resetState } from "./helpers";

// A fixed "now" 10 minutes into an hour, so window boundaries are predictable.
const NOW = hourWindowStart(Date.now()) + 10 * 60_000;
const windowOf = (t: number) => Math.floor(t / HOUR_MS);

function input(over: Partial<ReserveInput> = {}): ReserveInput {
  return {
    senderId: randomUUID(),
    campaignId: randomUUID(),
    gapMs: 0,
    senderLimit: 1000,
    campaignLimit: 1000,
    globalLimit: 0,
    now: NOW,
    ...over,
  };
}

describe("reserveSendSlot (Redis Lua rate limiter)", () => {
  beforeEach(resetState);
  afterAll(closeAll);

  it("spaces sends of the same sender by the minimum gap, in order", async () => {
    const base = input({ gapMs: 2000 });
    const slots: number[] = [];
    for (let i = 0; i < 5; i++) slots.push((await reserveSendSlot(base)).slotAt);
    expect(slots).toEqual([NOW, NOW + 2000, NOW + 4000, NOW + 6000, NOW + 8000]);
  });

  it("different senders do not block each other", async () => {
    const a = await reserveSendSlot(input({ gapMs: 5000 }));
    const b = await reserveSendSlot(input({ gapMs: 5000 }));
    expect(a.slotAt).toBe(NOW);
    expect(b.slotAt).toBe(NOW);
  });

  it("never exceeds the hourly limit, even with 50 concurrent workers", async () => {
    const base = input({ senderLimit: 10 });
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveSendSlot(base)));

    const perWindow = new Map<number, number>();
    for (const r of results) perWindow.set(windowOf(r.slotAt), (perWindow.get(windowOf(r.slotAt)) ?? 0) + 1);

    // 50 jobs, 10/hour → exactly 10 in each of the next 5 hour windows, none dropped
    expect([...perWindow.values()]).toEqual([10, 10, 10, 10, 10]);
    expect(perWindow.get(windowOf(NOW))).toBe(10);
  });

  it("books overflow into the next free hour and keeps the original order", async () => {
    const base = input({ senderLimit: 10, gapMs: 1000 });
    const results = [];
    for (let i = 0; i < 25; i++) results.push(await reserveSendSlot(base));

    const slots = results.map((r) => r.slotAt);
    expect(slots).toEqual([...slots].sort((x, y) => x - y)); // order preserved
    expect(results.slice(0, 10).every((r) => r.limitedBy === null)).toBe(true);
    expect(results.slice(10).every((r) => r.limitedBy === "sender")).toBe(true);
    expect(windowOf(results[10].slotAt)).toBe(windowOf(NOW) + 1);
    expect(windowOf(results[20].slotAt)).toBe(windowOf(NOW) + 2);
    // bookings inside a future hour still respect the min gap
    expect(results[11].slotAt - results[10].slotAt).toBe(1000);
  });

  it("reports the reservation that takes the last slot of the hour (Slack trigger)", async () => {
    const base = input({ senderLimit: 3 });
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await reserveSendSlot(base));
    expect(r.map((x) => x.reachedScope)).toEqual([null, null, "sender"]);
  });

  it("applies the per-campaign limit from the compose form", async () => {
    const base = input({ campaignLimit: 3 });
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await reserveSendSlot(base));
    expect(r[3].limitedBy).toBe("campaign");
    expect(windowOf(r[3].slotAt)).toBe(windowOf(NOW) + 1);
  });

  it("applies the global limit across all senders", async () => {
    const campaignId = randomUUID();
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await reserveSendSlot(input({ campaignId, globalLimit: 2 })));
    expect(r[2].limitedBy).toBe("global");
  });

  it("gap-only re-reservations (after a restart) do not consume hourly quota", async () => {
    const base = input({ senderLimit: 2, gapMs: 500 });
    await reserveSendSlot({ ...base, gapOnly: true });
    await reserveSendSlot({ ...base, gapOnly: true });
    const counted = await reserveSendSlot(base);
    expect(counted.limitedBy).toBeNull(); // the two gap-only calls were not counted
  });
});
