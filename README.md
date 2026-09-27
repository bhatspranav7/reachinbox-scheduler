# ReachInbox – Full-stack Email Job Scheduler

[![CI](https://github.com/bhatspranav7/reachinbox-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/bhatspranav7/reachinbox-scheduler/actions/workflows/ci.yml)

**🌐 Live frontend:** https://reachinbox-scheduler-hazel.vercel.app (the API runs on my machine via an ngrok tunnel, so it works while that is online; see Quick start to run everything locally)

**🎬 Demo video (≤ 5 min):** https://drive.google.com/file/d/13acw7zunDpoFbCEQ-JH8wje5_MauANv7/view?usp=sharing

A production-style email scheduler: an **Express + TypeScript** API that stores campaigns in **PostgreSQL**, schedules every email as a **BullMQ delayed job** on **Redis** (no cron anywhere), sends through **Ethereal SMTP** from a pool of senders, enforces **per-sender / per-campaign / global hourly limits** with Redis counters, alerts the user on **Slack** (real OAuth) when a limit is hit, indexes everything in **Elasticsearch** and ships with a live **Bull Board** queue dashboard. The **Next.js + Tailwind** dashboard has real **Google login**, a compose flow with CSV upload, and live Scheduled / Sent tables.

```
reachinbox-scheduler/
├── docker-compose.yml        Postgres · Redis (AOF) · Elasticsearch  (+ API / worker / frontend with --profile app)
├── .github/workflows/ci.yml  typecheck + tests (real Postgres & Redis) + builds on every push
├── sample-leads.csv
├── backend/                  Express API + BullMQ worker (TypeScript)
│   ├── drizzle/              SQL migrations (applied automatically on boot)
│   ├── scripts/load-test.ts  schedules 1000 emails at once and reports the spread
│   ├── test/                 Vitest: rate limiter + end-to-end scheduler tests
│   └── src/
│       ├── config/env.ts     every tunable, validated with zod
│       ├── db/               Drizzle schema + client + migrator
│       ├── queue/            email.queue · email.worker · rate-limiter (Lua) · reconcile
│       ├── services/         campaign · sender (Ethereal) · search (ES) · slack
│       ├── routes/           auth · emails/campaigns · slack
│       ├── index.ts          API + worker in one process
│       ├── api.ts / worker.ts   …or run them separately and scale workers
└── frontend/                 Next.js 15 (App Router) + NextAuth + Tailwind
    └── src/
        ├── app/              / (login) · /dashboard?tab=scheduled|sent · /compose · /emails/[id]
        ├── components/ui/    Button, IconButton, Input, Pill, Popover/MenuItem, EmptyState, Spinner, Avatar
        ├── components/layout/   Sidebar, UserMenu, Logo, LoginCard
        ├── components/mailbox/  Mailbox (list + search + filter + pagination), EmailRow, Toolbar
        ├── components/compose/  ComposeForm, RecipientsField, RichTextEditor, SendLaterPanel, FromSelect
        ├── components/email/    EmailView (detail page)
        ├── components/slack/    SlackNavItem (connect / test / disconnect)
        ├── hooks/            useApi (SWR + auth), useEmails, useDebounce
        └── lib/ · types/     API client, CSV lead parser, formatters, typed API contracts
```

---

## 1. Quick start

**Prerequisites:** Node 20+, Docker Desktop.

```bash
# 1) infra
docker compose up -d                 # postgres:55432  redis:56379  elasticsearch:9200

# 2) backend
cd backend
cp .env.example .env                 # fill GOOGLE_CLIENT_ID (+ Slack keys, see below)
npm install
npm run dev                          # runs migrations, provisions Ethereal senders, starts API + worker
#   API            http://localhost:4000
#   Queue board    http://localhost:4000/admin/queues
#   Health         http://localhost:4000/health

# 3) frontend (new terminal)
cd frontend
cp .env.example .env.local           # fill GOOGLE_CLIENT_ID / SECRET, NEXTAUTH_SECRET
npm install
npm run dev                          # http://localhost:3000
```

Migrations run automatically on startup (`npm run db:migrate` also works).
To run API and worker as separate processes: `npm run dev:api` + `npm run dev:worker` (start as many workers as you like; all limits are enforced in Redis, so they stay correct across instances).

### Or: run everything in Docker (one command)

After creating `backend/.env` and `frontend/.env.local` as above:

```bash
docker compose --profile app up --build          # API :4000 · worker · frontend :3000 · Postgres · Redis · Elasticsearch
docker compose --profile app up --scale worker=3 # three workers – limits stay exact because they live in Redis
```

The API and the worker run as separate containers (`RUN_WORKER=false` on the API), exactly the production split. Container-internal URLs (`postgres`, `redis`, `elasticsearch`) are set by the compose file, so the same `.env` works for both setups.

### Tests

```bash
cd backend
npm test          # needs the compose Postgres + Redis running; uses its own DB "reachinbox_test" (auto-created) and Redis DB 15
```

| Test | What it proves |
|---|---|
| never exceeds the hourly limit, even with 50 concurrent workers | the Lua reservation is atomic – exactly *limit* jobs per hour window, the rest land in later hours |
| books overflow into the next free hour and keeps the original order | nothing dropped, order preserved, min gap kept inside future hours |
| per-campaign / global limit, min-gap spacing, Slack trigger | every limit type and the "last slot" signal used for Slack |
| sends every email exactly once – even when jobs are enqueued again | duplicate recipients removed, re-enqueue + reconciliation never double-send (checked on a real SMTP server) |
| restart: Redis lost the jobs → reconciliation re-creates them | persistence across restarts / Redis loss |
| hourly limit reschedules in order, never dropped | end-to-end rate limiting through the real worker |
| hourly limit under concurrency (5 parallel jobs) | never more than the limit per hour, never dropped, whatever the timing |
| crash mid-send → marked failed, not sent twice | at-most-once guarantee |
| double-submitted campaign is created once | idempotency key |

CI runs the same suite against Postgres 16 + Redis 7 service containers on every push.

### Google OAuth (required for login)
1. Google Cloud Console → *APIs & Services → Credentials → Create OAuth client ID → Web application*.
2. Authorized JavaScript origin: `http://localhost:3000`
   Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Put the client id + secret in `frontend/.env.local`, and the **same client id** in `backend/.env` (`GOOGLE_CLIENT_ID`) – the backend verifies the Google ID token against it.
4. `NEXTAUTH_SECRET`: any long random string (`openssl rand -base64 32`).

### Ethereal Email (fake SMTP)
Nothing to do by default: on first boot the backend calls `nodemailer.createTestAccount()` `SENDER_COUNT` times (default 3), **stores the accounts in Postgres** and reuses them on every restart. Each sent email in the dashboard has an ↗ link to its Ethereal preview.
To use your own accounts, create them at <https://ethereal.email/create> and set `ETHEREAL_SENDERS=user1@ethereal.email:pass1,user2@ethereal.email:pass2`.

### Slack (rate-limit alerts)
1. <https://api.slack.com/apps> → *Create New App → From scratch*.
2. *OAuth & Permissions*: add bot scopes **`incoming-webhook`** and **`chat:write`**, and the redirect URL `https://<your-public-backend-url>/api/slack/oauth/callback`.
   Slack only accepts **HTTPS** redirect URLs, so for local demos expose the API with a tunnel, e.g. `ngrok http 4000`, and set `BACKEND_PUBLIC_URL=https://xxxx.ngrok-free.app` in `backend/.env`.
3. *Basic Information*: copy Client ID / Client Secret into `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
4. In the sidebar open **Integrations → Slack alerts → Connect Slack** → pick a channel → you land back on the dashboard and immediately get a "connected" message in that channel. **Send test** posts another one.

---

## 2. Architecture

```
 Browser (Next.js)                    Express API                           Redis                 Worker(s)
 ─────────────────                    ───────────                           ─────                 ─────────
 Google login (NextAuth) ──id_token──▶ POST /api/auth/google  (verify, issue API JWT)
 Compose + CSV ───────────────────────▶ POST /api/campaigns
                                        │ 1. tx: insert campaign + N email rows (Postgres = source of truth)
                                        │ 2. addBulk N delayed jobs, jobId = email.id ──▶ delayed ZSET ──▶ (at due time)
                                        │ 3. bulk index rows in Elasticsearch                              │
 Tables (SWR, 5s refresh) ◀── GET /api/emails?type=scheduled|sent&q=…                                       ▼
                                                                                              reserve slot (Lua, atomic)
                                                                                              claim row (CAS in Postgres)
                                                                                              send via Ethereal SMTP
                                                                                              mark sent/failed + reindex
 Slack ◀──────────────────── webhook / chat.postMessage ◀──── limit reached ────────────────────────┘
```

### How scheduling works
* `POST /api/campaigns` receives subject, body, recipients (parsed from the CSV in the browser), start time, delay between emails and the campaign hourly limit.
* Recipients are lower-cased and de-duplicated (plus a `UNIQUE(campaign_id, to_email)` constraint). Email *i* is scheduled at `startTime + i × delay` and gets a sender round-robin from the pool.
* All rows are written in **one transaction**, then one **BullMQ delayed job per email** is added with `delay = scheduledAt − now` and **`jobId = email.id`**. No cron, no polling: Redis wakes the job when it's due.

### How persistence on restart is handled
* **Redis is the scheduler's memory.** Delayed jobs live in Redis, which runs with **AOF persistence** (`appendonly yes`, `everysec`) in `docker-compose.yml` – stopping the Node process or even Redis doesn't lose them. When the server comes back, BullMQ simply continues: future emails fire at their original time, and overdue ones fire immediately.
* **Postgres is the source of truth.** On every boot `reconcilePendingEmails()` checks every `scheduled / delayed / sending` row and re-adds a job only if Redis doesn't have one (covers "Redis was wiped" or "crashed between DB insert and enqueue"). Because `jobId = email.id`, running it any number of times can't create duplicates.
* **Graceful shutdown**: on SIGINT/SIGTERM the worker stops taking jobs, waits for in-flight sends, then exits. A hard crash is caught by BullMQ's stalled-job detection (`lockDuration` 30s).

### Idempotency – an email is never sent twice
1. **One job per email** – `jobId = email.id`.
2. **One campaign per click** – the compose page sends an `idempotencyKey`; `UNIQUE(user_id, idempotency_key)` turns a double-submit into a no-op.
3. **Compare-and-set claim** – before sending, the worker runs `UPDATE emails SET status='sending' WHERE id=$1 AND status IN ('scheduled','delayed') RETURNING *`. Only one worker can win; `sent`/`failed` rows are skipped.
4. **Crash mid-send** – if a worker died after claiming (row stuck in `sending` for > 60s) the outcome is unknown, so the row is marked `failed` with an explanatory error instead of being retried (**at-most-once**; see trade-offs). Every message also carries a deterministic `Message-ID: <email.id@reachinbox-scheduler>`.

### How rate limiting & concurrency are implemented
| Setting | Env var | Default |
|---|---|---|
| Worker concurrency (jobs in parallel per worker process) | `WORKER_CONCURRENCY` | 5 |
| **Min delay between two sends of the same sender** | `MIN_DELAY_BETWEEN_EMAILS_MS` | **2000 ms (2 s)** |
| Max emails / hour **per sender** | `MAX_EMAILS_PER_HOUR_PER_SENDER` | 50 |
| Max emails / hour **globally** (0 = off) | `MAX_EMAILS_PER_HOUR` | 200 |
| Max emails / hour **per campaign** | "Hourly limit" field in Compose | user-defined |
| Delay between emails **per campaign** | "Delay between emails" field in Compose | user-defined |

Everything is enforced by **one atomic Redis Lua script** (`src/queue/rate-limiter.ts`) that hands out *send slots*:

```
slot = max(now, nextFree[sender])                      ← min gap between sends of this sender
loop:
  w = hour(slot)
  if counter[sender][w] ≥ L_sender or counter[campaign][w] ≥ L_campaign or counter[global][w] ≥ L_global:
      slot = start of hour w+1                          ← window full → look at the next one
  else:
      INCR the three counters for w  (keys: rl:<scope>:<id>:<hour>, auto-expiring)
      return slot
```

* The job then waits in BullMQ's delayed set until its slot (`job.moveToDelayed` + `DelayedError`, which doesn't consume a retry) and sends **without re-checking** – it already owns the slot.
* Because counters live in Redis and check-and-increment is a single script, the limits are exact across **any number of workers/instances**; two workers can never both take the last slot of an hour.
* **When the hourly limit is reached, jobs are not dropped or failed**: the script walks forward to the first hour that still has room and *books* the job there (incrementing that hour's counters right away). The row becomes `delayed` with its new `scheduled_at`, shown as "Rate-limited" in the dashboard.
* **Order is preserved**: slots are handed out in the order jobs are picked up (= scheduled order), later jobs see earlier bookings and queue behind them. Inside a future hour, a sender's bookings are spaced `gap` apart from the start of the hour.
* **Slack alert**: the moment a reservation takes the *last* slot of the current hour (or a job gets pushed to a later hour), the owner's Slack gets a message. A Redis `SET NX` key per *(user, scope, hour)* makes sure 1000 jobs hitting the same limit produce **one** message, not 1000. The Slack connection is read from the DB on every alert, so connecting/disconnecting takes effect instantly (no redeploy), and no connection simply means no alert.

### Behaviour under load (1000+ emails at the same time)
`npm run loadtest -- 1000` (with the API running) schedules 1000 emails for *now*. Measured locally with 3 senders × 50/hour:

```
status  | hour  | count | sequence range
sent    | 11:00 |  150  |   0 – 149     ← 3 senders × 50, spaced ≥ MIN_DELAY per sender
delayed | 12:00 |  150  | 150 – 299
delayed | 13:00 |  150  | 300 – 449
…                                        ← evenly spread, strictly in the original order
delayed | 17:00 |  100  | 900 – 999
```
* Inserting 1000 rows + 1000 delayed jobs takes ~0.3 s (chunked `INSERT` + `addBulk`).
* Each job is processed at most twice (reserve → wait → send); there's no retry storm or polling.
* A second campaign scheduled afterwards queues *behind* the already-booked capacity instead of colliding with it.

---

## 3. API

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/google` | `{ idToken }` → verifies with Google, upserts user, returns API JWT |
| GET | `/api/auth/me` | current user |
| POST | `/api/campaigns` | schedule `{ subject, body (text or HTML), recipients[], startTime, delayMs, hourlyLimit, idempotencyKey?, senderId? }` – `senderId` pins one sender, otherwise round-robin |
| GET | `/api/campaigns` | latest campaigns |
| GET | `/api/emails?type=scheduled\|sent&status=&q=&page=&pageSize=` | lists; `status` narrows inside a tab (e.g. `delayed`, `failed`); `q` searches via **Elasticsearch** (falls back to Postgres `ILIKE` if ES is down) |
| GET | `/api/emails/:id` | one email with its body, sender and delivery details (detail view) |
| GET | `/api/emails/stats` | counts per status |
| GET | `/api/config` | senders + configured limits (shown on the compose page) |
| POST | `/api/slack/install-url` | returns the Slack authorize URL (`state` = signed, 10-min token with the user id) |
| GET | `/api/slack/oauth/callback` | Slack redirect → exchanges code, stores token/webhook per user |
| GET / DELETE | `/api/slack/status` · `/api/slack` | status / disconnect (revokes token) |
| POST | `/api/slack/test` | sends a test message |
| GET | `/admin/queues` | **Bull Board** live queue dashboard (optional basic auth) |
| GET | `/health` | DB/Redis/ES status + queue counts |

All `/api/*` routes except auth callbacks need `Authorization: Bearer <token>`.

---

## 4. Features implemented

**Backend**
- ✅ Scheduler – BullMQ delayed jobs, one per email, `jobId = email.id`; **no cron** of any kind
- ✅ Persistence – Postgres source of truth + AOF Redis; startup reconciliation; graceful shutdown; stalled-job recovery
- ✅ Idempotency – unique job ids, campaign idempotency key, recipient de-dupe + unique index, CAS claim, at-most-once on crash
- ✅ Multiple senders – Ethereal accounts auto-provisioned & persisted, round-robin assignment, pooled SMTP transports
- ✅ Concurrency – `WORKER_CONCURRENCY`, safe with many workers/instances
- ✅ Min delay between sends – per sender, Redis-backed (`MIN_DELAY_BETWEEN_EMAILS_MS`, default 2 s)
- ✅ Hourly rate limits – per sender, per campaign and global, all configurable; overflow booked into the next free hour in order
- ✅ Slack – real OAuth v2 install flow, per-user token/webhook, alert on limit, dedup per hour, disconnect/reconnect without restart
- ✅ Elasticsearch – every row indexed on create and on every status change; fuzzy search on recipient/subject/body
- ✅ Bull Board – `/admin/queues`
- ✅ Validation (zod) and consistent JSON errors
- ✅ **Automated tests** (Vitest, real Postgres + Redis + SMTP) and **GitHub Actions CI**
- ✅ **One-command Docker run** with API and worker as separate, horizontally scalable services

**Frontend**
- ✅ **Built to the Outbox Labs Figma** (login, homepage Scheduled/Sent, email detail, compose + Send Later)
- ✅ Real Google OAuth (NextAuth) → redirect to dashboard; user card with name, email, avatar and **Logout** at the top of the sidebar (where the Figma puts it)
- ✅ Homepage: sidebar with **Compose**, **Scheduled** / **Sent** (live counts), search pill (Elasticsearch), status filter, refresh
- ✅ Compose New Email (full page, as in the Figma): From (one sender or round-robin), To with email chips / `+N` / typing / paste, **Upload List** (CSV/TXT) with detected-address count, Subject, Delay between 2 emails, Hourly Limit, rich-text body (bold, italic, lists, quote, …), **Send Later** popover (date-time picker + "Tomorrow" presets) → **Send / Send Later**
- ✅ Lists: Email · Subject · time pill (scheduled time, or sent time) · Status (Scheduled / Rate-limited / Sending / Sent / Failed)
- ✅ Email detail page: sender, recipient, time, delivery status (rescheduled from, attempts, error, Ethereal preview link), HTML body rendered in a sandboxed iframe
- ✅ Loading skeletons, empty states, error state with retry, toasts, pagination, debounced search, live refresh every 5 s
- ✅ Slack connect / test / disconnect under *Integrations* in the sidebar
- ✅ Reusable typed UI components, typed API contracts, responsive down to phone width

---

## 5. Demo script (≤ 5 min)

1. `docker compose up -d`, `npm run dev` in both folders, sign in with Google.
2. **Connect Slack** → show the "connected" message in the channel.
3. **Compose** → **Upload List** `sample-leads.csv` → delay 5, hourly limit 100 → clock icon → pick a time 2 min ahead → **Send Later**. Show the Scheduled tab and `/admin/queues` (jobs in *delayed*).
4. **Restart**: stop the backend with Ctrl-C while emails are still in the future, wait, `npm run dev` again → the emails still go out at their time; the Sent tab fills in, no duplicates (ids/Message-IDs unique; Ethereal inbox shows each once).
5. **Rate limit**: set `MAX_EMAILS_PER_HOUR_PER_SENDER=2` and restart, schedule the sample file → the first emails send, the rest turn **Rate-limited** with times in the next hour, and Slack receives the alert. Optionally `npm run loadtest -- 1000` to show the hour-by-hour spread.

---

## 6. Assumptions, shortcuts & trade-offs

- **At-most-once on crashes.** A worker that dies *between* the SMTP send and writing `sent` leaves an unknown outcome. We mark such rows `failed` ("outcome unknown") instead of resending, because duplicates were the explicit hard constraint. Switching to at-least-once is a one-line change; the deterministic `Message-ID` lets receivers dedupe.
- **Rate limits are counted at reservation time.** A slot booked in a future hour counts toward that hour even if the send later fails; failed sends are retried (exponential backoff, `SEND_MAX_ATTEMPTS`) and take a fresh slot. This can under-use a window slightly but never exceeds it.
- **Order is best-effort under concurrency.** Slots are handed out in the order jobs *reach the limiter*. With `WORKER_CONCURRENCY > 1`, jobs that hit a full hour in the same millisecond can swap between two adjacent hours (found by the test suite on a Windows machine). Limits are never exceeded and nothing is dropped; with concurrency 1 the order is strict (covered by a test). A stricter ordering would need a per-campaign sequence lock, which would cost throughput.
- **Hour windows are UTC clock hours** (fixed windows, not sliding). Simple to reason about and to show in Slack.
- **Fairness is FIFO.** A huge campaign books a sender's capacity for the next hours; a campaign created later queues behind it on the shared senders. Per-tenant sender pools would be the next step.
- **Lua keys are built inside the script**, which is fine for a single Redis/Sentinel; for Redis Cluster the keys would need a shared hash tag.
- **Elasticsearch is a derived view.** If it's down, sending is unaffected and search falls back to Postgres `ILIKE` (the UI says which engine answered).
- **Auth**: NextAuth handles Google OAuth; the backend verifies the Google ID token and issues its own 7-day JWT. No refresh flow – after 7 days the user signs in again.
- **Senders** are a shared pool (not per user). Templating/personalisation (`{{name}}`) and HTML editing were out of scope; the body is sent as text + simple HTML.
- **ORM**: Drizzle (Postgres) with SQL migrations committed in `backend/drizzle/`.
- **Figma**: the UI follows the Outbox Labs Figma frames. Additions not in the Figma: status filter, pagination, *Integrations → Slack* in the sidebar, the recipient-count/limits summary under the editor, and a sent-time column. The login card's email/password fields are shown as designed, but sign-in is Google-only (the brief requires Google OAuth), so submitting them shows a hint.
- **Attachments**: the Figma shows image attachments; attaching files to emails is out of scope – the paperclip opens the lead-list upload instead.
