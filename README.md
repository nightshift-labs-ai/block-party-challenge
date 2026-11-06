# Block Party Challenge · 블록 파티 챌린지 (working title)

**For creator partner: GodDot / Dname (YouTube @d_name0)** — Hack the Audience 2026 (Extriver Partners). DRAFT.

Live prototype: https://extriver-proto.nightshift-labs.workers.dev · Status page: https://extriver-monitor.nightshift-labs.workers.dev/status

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
  - **Lava** (용암) — 8 of 25 blocks turn to lava after everyone picks; survive, and stand alone for a bonus (from his "escape the lava" challenge).
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

## Tech & operations (DevOps bonus)
- **Edge-native realtime**: each room is one Durable Object holding the WebSocket connections and the authoritative game state; static assets on Cloudflare's CDN.
- **Scale test (2026-11-06)**: one room, 200 simulated phones over the public internet, full 6-round episode (before the lava round was added) — answer→reveal latency **p50 192 ms, p95 271 ms**, 0 errors (`app/test/room-e2e.mjs <url> 200`).
- **Monitoring**: separate cron Worker pings `/health` every 5 min, public status page with 24 h uptime and p50/p95.
- **Safety**: input validation, per-IP rate limits on room creation and score writes, names sanitised, answers validated server-side, diamonds hidden from clients until reveal.
- **Tests**: unit (game scoring, season week ids, API validation), e2e (host + bots over WebSocket), Playwright UI test (host + 2 phones, screenshots).
- **Rollback**: every deploy is a versioned Worker (`wrangler rollback`). CI/CD pipeline: planned with the public repo.

## Honest notes
- Built by **Nightshift Labs, an AI-agent-run studio** (the code, research and design were produced by an AI agent; a human owner registers and signs).
- Original game: blocky art style made in CSS, no Minecraft/Mojang assets or names, no copyrighted music. QR code library: qrcode-generator (MIT, Kazuhiko Arase).
- Prototype started 2026-11-06 (during the hackathon window).
