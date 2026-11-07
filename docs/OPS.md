# Operations runbook: Block Party Challenge

| What | Where |
|---|---|
| Production | https://extriver-proto.nightshift-labs.workers.dev (Cloudflare Worker `extriver-proto`, static assets + Durable Objects `Room`, `Board`, `Daily`) |
| Health | `GET /health` → `{ok, version, kv, time}` (503 if storage fails) |
| Uptime monitor | separate cron Worker `extriver-monitor`, pings /health every 5 min, keeps 24 h → https://extriver-monitor.nightshift-labs.workers.dev/status (+ `/status.json`) |
| Synthetic E2E | every hour the monitor plays a **full 7-round episode in production** (creates a practice room, host + 2 bot phones over WebSocket, ~4 s); result on the status page, failures alert by email (`[E2E FAIL]`) |
| Alerts | the monitor emails the on-call inbox after **2 failed checks in a row** (≤ 10 min) and again on recovery (one email per incident, no alert storms) |
| Backups | the monitor stores a daily copy of the season leaderboard (14 days) → `/backups.json`, one day: `/backups.json?day=YYYY-MM-DD` |
| CI/CD | `.github/workflows/ci.yml` (GitHub Actions workflow, written and kept in the repo as `ci/ci.yml`; **not yet enabled** in GitHub Actions because our automation token has no `workflow` scope; until then the same steps run by hand: tests → `wrangler deploy` → smoke test → `wrangler rollback` on failure): unit tests on every push/PR. On `main`: deploy, smoke test production (health + full WebSocket episode), **automatic rollback** to the previous version if the smoke test fails |

## Deploy by hand
```
cd app && npm test && npx wrangler@4 deploy
node test/room-e2e.mjs https://extriver-proto.nightshift-labs.workers.dev        # 3 bots, full episode, host veto check
node test/room-e2e.mjs https://extriver-proto.nightshift-labs.workers.dev 200    # load: 200 phones in one room, prints p50/p95
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
- One Durable Object per room: rooms scale out independently. Measured: 200 phones in one room, p50 ≈ 0.2 s answer→reveal (README).
- Answer bursts are coalesced into one broadcast per 120 ms in rooms over 20 players. Snapshots are throttled to ≤ 1/s.
- Rooms hibernate when idle (no duration billing). Round timers are storage alarms, so a room evicted mid-round still reveals on time.
- Abuse: per-IP rate limits (room creation 10/min, scores 20/min, daily answers 60/min), server-side validation of every answer, hidden cells never sent before the reveal.

## Incidents
1. The status page shows failures → `curl -i <url>/health`, then `npx wrangler@4 tail extriver-proto` for live logs.
2. A bad deploy → roll back (above), then fix forward with a test that reproduces it.
3. A room is stuck → the host's "Play again" resets it, and players reconnect automatically (1.5 s retry) with their id kept in sessionStorage.

## Backups and restore
- Long-lived data is small: the weekly season leaderboard (Durable Object `Board`, SQLite) and the Daily Challenge results. Rooms are ephemeral by design.
- The monitor copies the season leaderboard once a day to KV (14-day retention). Restore = re-POST the entries of the chosen day to `/api/score` (same validation as live traffic), or rebuild the week from scratch: a season only lasts 7 days.
- Code and docs: GitHub (public repo) is the source of truth; every deploy is an immutable Worker version (rollback above).

## Maintenance and on-call
| Task | Cadence | How |
|---|---|---|
| Dependencies / security patches | weekly + on advisories | the Worker has **no runtime npm dependencies** (plain JS on the Workers runtime, which Cloudflare patches); dev tools pinned by major version (`wrangler@4`), so there is no third-party runtime code to patch. |
| Content (new rounds, prompts) | weekly, before the creator's Friday episode | data-only change in `games.js` + unit test → CI deploy → smoke test |
| Load test | before every promoted episode | `node test/room-e2e.mjs <url> 200` (p50/p95 printed); tested with 200 bot phones in one room; the room cap is 300 but 300 has not been load-tested yet, unlimited rooms |
| Review alerts / logs | daily | status page + `wrangler tail`; incident notes go into this file |
| On-call | always | first responder = the Nightshift Labs operator agent (runs every hour, reads the alert inbox); the human team representative is the escalation contact for anything needing account access |

## Kids' safety and privacy (the creator's audience is mostly under 14)
- **No accounts, no personal data:** a player is a nickname (max 12 chars) plus a random id kept in the phone's sessionStorage. No email, phone number, age, location, cookies for tracking or ads SDKs.
- **No chat, no free text on screen** except nicknames. Nicknames are filtered before they reach the stream (`app/src/namefilter.js`: English + Korean insults/slurs/sexual terms, leetspeak and spacing tricks; unsafe names become a friendly generated name such as "LuckyFox42"; unit-tested for false positives like "Grape", "Cassie", "한남동").
- **Kids never pay to enter** a game. Paid items (Fan Pass, cosmetics) are planned only behind the creator's existing store and parental payment flows; see BUSINESS.md.
- **Retention:** rooms forget players when they end; leaderboards keep nickname + score only (season board: 7 days live + 14-day backup).
- Basic security: server-side validation of every answer and score, per-IP rate limits, hidden answers never sent to phones before the reveal, HTTPS/WSS only.
