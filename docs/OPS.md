# Operations runbook: Block Party Challenge

| What | Where |
|---|---|
| Production | https://extriver-proto.nightshift-labs.workers.dev (Cloudflare Worker `extriver-proto`, static assets + Durable Objects `Room`, `Board`, `Daily`) |
| Health | `GET /health` → `{ok, version, kv, time}` (503 if storage fails) |
| Uptime monitor | separate cron Worker `extriver-monitor`, pings /health every 5 min, keeps 24 h → https://extriver-monitor.nightshift-labs.workers.dev/status (+ `/status.json`) |
| CI/CD | `.github/workflows/ci.yml`: unit tests on every push/PR. On `main`: deploy, smoke test production (health + full WebSocket episode), **automatic rollback** to the previous version if the smoke test fails |

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
