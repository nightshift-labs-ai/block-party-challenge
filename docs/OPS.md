# Operations runbook: Block Party Challenge

| What | Where |
|---|---|
| Production | https://extriver-proto.nightshift-labs.workers.dev (Cloudflare Worker `extriver-proto`, static assets + Durable Objects `Room`, `Board`, `Daily`) |
| Health | `GET /health` → `{ok, degraded, version, kv, db, time}`: liveness (503 only if KV fails; a leaderboard DB failure = 200 with `degraded:true`). `GET /health?ready=1` = strict readiness (503 on any failure) |
| Health checks | `/health` = liveness: 200 while games work, with `"degraded": true` if the leaderboard database fails (rooms are separate Durable Objects and keep running); `/health?ready=1` = strict readiness, 503 on any failure (use before promoting a deploy) |
| Uptime monitor | separate cron Worker `extriver-monitor`, pings /health every 5 min, keeps 24 h → https://extriver-monitor.nightshift-labs.workers.dev/status (+ `/status.json`) |
| Synthetic E2E | every hour the monitor plays a **full 7-round episode in production** (creates a practice room, host + 2 bot phones over WebSocket, ~4 s); result on the status page, failures alert by email (`[E2E FAIL]`) |
| Alerts | the monitor emails the on-call inbox after **2 failed or degraded checks in a row** (subject `[DOWN]` or `[DEGRADED]`); the status page shows game uptime and full-service % (incl. leaderboard) separately, orange bars = degraded (≤ 10 min) and again on recovery (one email per incident, no alert storms) |
| Backups | the monitor stores a daily copy of the season leaderboard (14 days) → `/backups.json`, one day: `/backups.json?day=YYYY-MM-DD` |
| CI/CD | `.github/workflows/ci.yml` (GitHub Actions workflow, written and kept in the repo as `ci/ci.yml`; **not yet enabled** in GitHub Actions because our automation token has no `workflow` scope; until then the same steps run by hand: tests → `wrangler deploy` → smoke test → `wrangler rollback` on failure): unit tests on every push/PR. On `main`: deploy, smoke test production (health + full WebSocket episode), **automatic rollback** to the previous version if the smoke test fails |

## Deploy by hand
```
cd app && npm test && npx wrangler@4 deploy
node test/room-e2e.mjs https://extriver-proto.nightshift-labs.workers.dev        # 3 bots, full episode, host veto check
node test/room-e2e.mjs https://extriver-proto.nightshift-labs.workers.dev 200    # load: 200 phones in one room, prints p50/p95
node test/live-audience-e2e.mjs https://extriver-proto.nightshift-labs.workers.dev # host takeover refused, late join, phone + host reconnect, join after the final
node test/alarm-e2e.mjs https://extriver-proto.nightshift-labs.workers.dev       # round timer fires with no answers (storage alarm)
node ../tools/uitest.mjs <url> <dir>; node ../tools/dailytest.mjs <url> <dir>; node ../tools/overlaytest.mjs <url> <dir>   # browser tests
```

## Roll back
Every deploy is an immutable Worker version.
```
npx wrangler@4 deployments list            # find the last good version id
npx wrangler@4 rollback <version-id> -m "reason"
```
Durable Object storage is not rolled back. Schema changes are additive only (`CREATE TABLE IF NOT EXISTS`, new classes through new migration tags), so an older version still reads the data.

## Scaling and limits
- One Durable Object per room: rooms scale out independently. Measured: 200 phones in one room, p50 ≈ 0.2 s answer→reveal; at the 300-phone cap (2026-11-07) 300 simulated phones (the room cap): all joined in 5.0 s, answer→reveal p50 0.46 s, p95 0.71 s (raw output: docs/loadtest-300-2026-11-07.txt).
- Answer bursts are coalesced into one broadcast per 120 ms in rooms over 20 players. Snapshots are throttled to ≤ 1/s.
- Rooms hibernate when idle (no duration billing). Round timers are storage alarms, so a room evicted mid-round still reveals on time.
- Abuse: per-IP rate limits (room creation 10/min, scores 20/min, daily answers 60/min), server-side validation of every answer, hidden cells never sent before the reveal.

## Incidents
1. The status page shows failures → `curl -i <url>/health`, then `npx wrangler@4 tail extriver-proto` for live logs.
2. A bad deploy → roll back (above), then fix forward with a test that reproduces it.
3. A room is stuck → the host's "Play again" resets it, and players reconnect automatically (1.5 s retry) with their id kept in sessionStorage.

### Incident log
**2026-11-07, season leaderboard unavailable (first noticed ~17:00 UTC; recovered ~00:30 UTC Nov 8, about 30 minutes after the daily quota reset at 00:00 UTC, confirmed by `/health` returning `db: ok` and a production Daily Challenge test). Games kept working.**
- *What happened:* the season leaderboard (`/api/leaderboard`) returned errors. Rooms, the Daily Challenge and the hourly production
  end-to-end game test kept working: 24 of 24 synthetic episodes passed that day.
- *Cause:* the Cloudflare free plan's Durable Object "rows read per day" limit is shared by **every** Worker on the account. Another
  service of ours on the same account (an API request log) ran an unindexed `DELETE` on every request, which scanned its whole table
  and used up the account's daily quota. Our own code was fine, but it shared the quota.
- *Detection:* found by our own checks (a leaderboard error in a browser test), not by the monitor, because `/health` did not test the
  database yet.
- *Fixes:* (1) the other service now uses an index and prunes rarely. (2) `/health` now checks the leaderboard database, so the
  monitor alerts on this kind of failure (that is why the status page shows ~2 h of 503s from 18:50 UTC: the new check correctly
  reporting the ongoing problem; from 21:08 UTC `/health` reports this case as "degraded" (orange), since games kept working). (3) The leaderboard now answers `{entries: [], unavailable: true}` and the home page shows
  "Leaderboard is taking a short break", instead of an error page. (4) The game Worker has a top-level guard that returns JSON 503,
  never a raw error page.
- *Lesson / follow-up:* on the free plan one heavy Durable Object can starve unrelated services. Always index Durable Object SQL filters.
  Before launch with Dname, move to Workers Paid ($5/month, BUSINESS.md §5), where usage past the included amount is billed instead of blocked.

## Backups and restore
- Long-lived data is small: the weekly season leaderboard (Durable Object `Board`, SQLite) and the Daily Challenge results. Rooms are ephemeral by design.
- The monitor copies the season leaderboard once a day to KV (14-day retention). Restore = write the entries of the chosen day back into the season Board Durable Object with a one-off admin script (the public `/api/score` is closed in production: only game rooms record scores), or rebuild the week from scratch: a season only lasts 7 days.
- Code and docs: GitHub (public repo) is the source of truth; every deploy is an immutable Worker version (rollback above).

## Maintenance and on-call
| Task | Cadence | How |
|---|---|---|
| Dependencies / security patches | weekly + on advisories | the Worker has **no runtime npm dependencies** (plain JS on the Workers runtime, which Cloudflare patches); dev tools pinned by major version (`wrangler@4`), so there is no third-party runtime code to patch. |
| Content (new rounds, prompts) | weekly, before the creator's Friday episode | data-only change in `games.js` + unit test → CI deploy → smoke test |
| Load test | before every promoted episode | `node test/room-e2e.mjs <url> 200` (p50/p95 printed); tested with 200 and (2026-11-07) 300 bot phones in one room (300 = the room cap); rooms are unlimited |
| Review alerts / logs | daily | status page + `wrangler tail`; incident notes go into this file |
| On-call | always | first responder = the Nightshift Labs operator agent (runs every hour, reads the alert inbox); the human team representative is the escalation contact for anything needing account access |

## Kids' safety and privacy (we assume much of the creator's audience is under 14; not verified, so we design for it)
- **No accounts, no personal data:** a player is a nickname (max 12 chars) plus a random id kept in the phone's sessionStorage. No email, phone number, age, location, cookies for tracking or ads SDKs.
- **No chat.** The only typed text that reaches the big screen is nicknames and the one-word answers of the "Don't Say It" round (16-character limit, the same blocklist, hidden if unsafe, and the host can reject any word with one tap). Nicknames are filtered before they reach the stream (`app/src/namefilter.js`: English + Korean insults/slurs/sexual terms, leetspeak and spacing tricks; unsafe names become a friendly generated name such as "LuckyFox42"; unit-tested for false positives like "Grape", "Cassie", "한남동").
- **Kids never pay to enter** a game. Paid items (Fan Pass, cosmetics) are planned only behind the creator's existing store and parental payment flows; see BUSINESS.md.
- **Retention:** rooms forget players when they end; leaderboards keep nickname + score only (season board: 7 days live + 14-day backup). The Daily Challenge table of each day (nickname, total, anonymous token) deletes itself 8 days later (Durable Object alarm), after that week's final.
- Basic security: server-side validation of every answer and score, per-IP rate limits, hidden answers never sent to phones before the reveal, HTTPS/WSS only.
