# Block Party Challenge · 블록 파티 챌린지 (working title)

**For creator partner: GodDot / Dname (YouTube @d_name0)** — Hack the Audience 2026 (Extriver Partners). DRAFT.

Live prototype: https://extriver-proto.nightshift-labs.workers.dev · Status page: https://extriver-monitor.nightshift-labs.workers.dev/status

Docs: [business model + 3-scenario funnel](docs/BUSINESS.md) (`tools/model.py`) · [creator research](RESEARCH.md) · pitch deck `docs/pitch.pdf` · 2:40 demo video `docs/demo.mp4` (real recorded episode with 10 players; rebuild with `tools/recvideo.mjs` + `tools/makevideo.sh`).

## The idea in one line
Dname's shorts are already games — "find the diamond and win", greed game, block telepathy, trust game — and his tagline is
"Subscribe and join the game!". Block Party Challenge lets his viewers actually play those formats **with him and with each other**:
one big screen (his stream, a classroom TV, a living-room TV) and everyone joins from their phone with a 4-letter code or QR. No app, no account.

## How it plays
- Host opens the site on a big screen → room code + QR. Up to **300 phones** per room (streamer mode), 4–12 for friend groups.
- An *episode* = 7 fast rounds (12–15 s each), timed by the server so nobody can cheat the clock:
  - **Telepathy** (텔레파시) — pick the answer most people will pick. Points = how many others matched you.
  - **Greed** (욕심 게임) — a shared pot; everyone secretly takes 0–10 coins. If the total fits, everyone keeps theirs; if the room gets greedy, everyone gets 0.
  - **Find the Diamond** (다이아 찾기) — a 5×5 block field hides one diamond; closer picks score more.
  - **Block Telepathy** (블록 텔레파시) — pick the block the crowd picks.
  - **Don't Say It** (금지어 챌린지) — from his top short ("Don't say ㄹ and win", 5.5M views): name something in a category with one typed word; Korean words containing ㄹ anywhere (라, 를, 닭…) or English words with an E are busted. Unique clean words score double. The host/streamer can tap any word to reject it (off-topic or not OK on stream); a kid-safety blocklist hides bad words before they ever reach the big screen.
  - **Lava** (용암) — 8 of 25 blocks turn to lava after everyone picks; survive, and stand alone for a bonus (from his "escape the lava" challenge).
- **Try it alone** (for judges and first-time visitors): the home-page button "Try it alone (with 6 bots)" opens a practice room where 6 bot players join
  from the host page. Open the join link on your phone or in a second tab and play a full episode alone. Practice rooms never touch the season board.
- **Daily Challenge** (`/?daily=1`, 오늘의 챌린지): shorts viewers arrive at any hour, not just during the weekly live final. Every Korean day has
  the same 5 rounds for everyone (seeded by date). You play against *today's crowd*: telepathy scores the % of players who picked what you picked,
  and lava gives a bonus if under 5% stood on your block. Ends with a Wordle-style shareable result (🟩🟨⬛ + points + link): the share loop
  that brings players between videos. One SQLite Durable Object per day; one answer per device per round.
- **Sponsored episodes** (business model, built in): host URL `/?title=Dname Final #1&sponsor=Snack Co&prize=Top 3 get a snack box` shows a banner on the big
  screen and every phone ("presented by … · free entry"). The prize is only described. Nothing is collected or paid through the game. Works in the overlay URL too.
- **Make a Short** (쇼츠 만들기): on the final screen (Korean-first text, English underneath) the host clicks one button and the browser renders a ~25 s 1080×1920 recap video of the episode (title card → one big number per round, e.g. "71% said Left", "14/18 coins: everyone keeps them" → animated podium). Canvas + MediaRecorder, nothing uploaded, no music (the creator adds his own track). Every episode becomes ready-to-edit Shorts material, which is how Dname already publishes. Sample output: [docs/sample-short.mp4](docs/sample-short.mp4) (6 bots). Test: `node tools/shorttest.mjs <url> /tmp/short.webm`.
- **Streamer overlay**: `/?overlay=1` as an OBS/stream browser source — transparent background, outlined text, keyboard-driven (Space/Enter: start → reveal → next), so Dname can run a live "Dname Final" with viewers on their phones.
- Results reveal on the big screen (vote bars, the greedy total, the dug-up grid), then a leaderboard. Every finished episode feeds a **weekly season top 10**.

## Why Dname's audience (research summary — see RESEARCH.md)
- Highest reach per video among the five partners: median ≈1.7M views per short (top 5.5M), 270K subscribers (counts from 2026-11-06).
- Every video is a viewer-prize challenge built on simple game theory (greed, trust, telepathy, luck) — exactly the rounds above.
- Korean kids/teens audience *(not verified; no public demographics)* → no-install, phone-as-controller, classroom- and friend-group-friendly.
- Content flywheel: the weekly "Dname Final" room is streamed/recorded → becomes his next short → brings new players → next week's final.

## Business model (draft)
- **Free to play** — a game must spread before it can earn.
- **Fan Pass ₩4,900/month**: private rooms with custom question packs, extra cosmetics, a season badge. (Payments by parents/vouchers; minors protections apply.)
- **Cosmetics ₩1,000–5,000**: blocky avatars, reveal effects, emotes — no pay-to-win.
- **Sponsored episodes**: a brand sponsors a weekly episode and its prizes (snack/food brands already appear in his niche). Prizes are always **free-entry and sponsor-funded, never paid by players** (no gambling/lottery mechanics).
- **Group licence** for classrooms/academies (Jackbox-style party games show people pay for this format).
- Costs: serverless (Cloudflare Workers + Durable Objects) — near-zero at rest, scales per room; numbers to be measured in the load test.
- Open checks before a commercial launch: Korean game rating (GRAC) for online games, payment rules for minors.

## Unit cost (estimate from Cloudflare's published Durable Objects pricing, checked 2026-11-06)
Pricing: requests $0.15 per million (incoming WebSocket messages count 20:1), duration $12.50 per million GB-s (128 MB per object; **hibernated rooms are not billed**), SQLite rows written $1.00 per million. Free plan: 100k requests, 13,000 GB-s and 100k rows written per day.

| One 7-round episode | 10 players (friends) | 300 players (stream) |
|---|---|---|
| DO requests (1 join + 7 answers ÷ 20 per player) | ≈ 14 | ≈ 405 |
| Active duration (≈0.3 s per broadcast burst, assumed) | ≈ 15 s → 2 GB-s | ≈ 105 s → 13 GB-s |
| Rows written (state snapshots, throttled) | ≈ 20 | ≈ 60 |
| **Cost** | **≈ $0.00003** | **≈ $0.0003** |

So 1 million player-episodes cost roughly **$1–5** in infrastructure, and the free plan alone covers about 250 streamer-size episodes a day (its 100k-request limit binds before the 13,000 GB-s duration limit); beyond that the paid plan ($5/month base) applies.
Margins are therefore set by payment fees and app-store/PG cuts, not servers. Duration per burst is an assumption to be replaced with measured analytics after the load test.

## Tech & operations (DevOps bonus)
- **Edge-native realtime**: each room is one Durable Object holding the WebSocket connections and the authoritative game state; static assets on Cloudflare's CDN.
- **Hibernation**: rooms use hibernatable WebSockets; state is snapshotted to Durable Object storage and round timers are storage alarms, so an idle room costs nothing and survives eviction (`app/test/alarm-e2e.mjs`).
- **Scale test (latest 2026-11-06, current 7-round episode incl. the typed-word round, hibernation + persisted state)**: one room, 200 simulated phones over the public internet, full episode, 1,400 answers, answer→reveal latency **p50 219 ms, p95 260 ms**, 0 errors, 0 handshake retries (`app/test/room-e2e.mjs <url> 200`). Earlier runs the same day: p50 192–238 ms.
- **Monitoring + alerts**: separate cron Worker pings `/health` every 5 min, public status page with 24 h uptime and p50/p95; emails the on-call inbox after 2 failed checks in a row and on recovery; daily leaderboard backup (14 days, `/backups.json`); an hourly synthetic end-to-end test plays a full episode in production (host + 2 bot phones) and alerts on failure. Maintenance plan, on-call and restore steps: docs/OPS.md.
- **Safety**: input validation, per-IP rate limits on room creation and score writes, nicknames sanitised and filtered for English/Korean insults before they reach the stream (kids' audience, `app/src/namefilter.js`), answers validated server-side, diamonds hidden from clients until reveal.
- **Tests**: unit (game scoring, season week ids, API validation), e2e (host + bots over WebSocket), Playwright UI test (host + 2 phones, screenshots).
- **Rollback**: every deploy is a versioned Worker (`wrangler rollback`). CI/CD pipeline: `ci/ci.yml` (tests → deploy → production smoke test → automatic rollback), ready to enable in GitHub Actions.

## Honest notes
- Built by **Nightshift Labs, an AI-agent-run studio** (the code, research and design were produced by an AI agent; a human owner registers and signs).
- Original game: blocky art style made in CSS, no Minecraft/Mojang assets or names, no copyrighted music. QR code library: qrcode-generator (MIT, Kazuhiko Arase).
- Prototype started 2026-11-06 (during the hackathon window).
