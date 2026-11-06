# Block Party Challenge: business model (draft, 2026-11-06)

Partner creator: **GodDot / Dname** (YouTube @d_name0). Every number below that is not a public count is an **assumption**,
marked (A). The model is in `tools/model.py`, so judges and the creator can change the inputs and re-run it.

## 1. Who pays, and why they would
| Payer | What they get | Why they pay |
|---|---|---|
| **Brands** (snacks, kids' food, stationery, mobile games) | A sponsored weekly "Dname Final" episode: branded round, logo on the big screen, the prize | They already buy kids' attention through creators. Here it comes as *play time*, not a 5-second mention. |
| **Fans' parents** (Fan Pass ₩4,900/mo) | Private rooms for friend groups, custom question packs, cosmetics, a season badge | The kid wants to play "Dname's game" with friends between videos. Price is in the range of one snack run. |
| **Fans** (cosmetics ₩1,000–5,000) | Blocky avatars, reveal effects, emotes. No pay-to-win. | Status inside the room, and on Dname's stream. |
| **Teachers / academies** (group licence ₩9,900/mo) | Ad-free classroom mode, custom quiz packs on school topics | Phones-as-buzzers party games are already used in classrooms. Jackbox and Kahoot prove the format. |

Prizes are **always sponsor-funded with free entry**. Players never pay to enter, and nothing random can be bought.
This keeps it out of gambling/lottery rules and is a hard design rule, not a later fix.

## 2. Funnel (how players arrive)
Public counts (2026-11-06): 270K subscribers, median **≈1.7M views** over the last 50 shorts, but recent uploads are rare and
weaker (13K–755K). The model therefore uses lower view numbers than the median.

1. Dname posts a short that *is* a game round ("Don't say ㄹ", "Find the diamond") and ends with "join this week's final: QR / link in the pinned comment".
2. Viewers play the same round on their phones in the weekly live final. The best moments become his next short.
3. Between finals, the **Daily Challenge** (live now: `/?daily=1`) catches viewers whenever they watch a short. Its shareable 🟩🟨⬛ result brings in friends.
4. Players bring friends into private rooms (Fan Pass), and teachers find it through students.

| Input (A) | Conservative | Base | Optimistic |
|---|---|---|---|
| Shorts per month featuring the game | 1 | 2 | 2 |
| Views per short | 300K | 800K | 1.7M |
| View → player join rate | 0.5% | 1% | 2% |
| Month-to-month player retention | 25% | 30% | 35% |
| Fan Pass conversion (of monthly players) | 0.5% | 1% | 1.5% |
| Cosmetics buyers (of monthly players, ₩3,000 avg) | 1% | 2% | 3% |
| Sponsored episodes per month from month 3 (₩2M each) | 0 | 1 | 2 |
| Classroom licences by month 12 | 10 | 40 | 100 |

## 3. Results (year 1, `python3 tools/model.py`, ₩1,380 = $1)
| | Monthly players at m12 | Gross revenue m12 | **Year-1 gross** | Year-1 net of ~10% payment fees | Creator's 20% share |
|---|---|---|---|---|---|
| Conservative | 2,000 | ₩0.2M | ₩1.9M ($1.4K) | ₩1.7M | ₩0.34M ($250) |
| **Base** | 22,900 | ₩4.9M | **₩51M ($37K)** | ₩46M | **₩9.3M ($6.7K)** |
| Optimistic | 104,600 | ₩22M | ₩242M ($176K) | ₩218M | ₩44M ($32K) |

What the model shows:
- **Sponsorship is the biggest line** in the base case (≈40% of revenue). The game turns his audience into a sellable ad format
  without asking kids to pay. That matters most for a kids' audience.
- Revenue depends on **shorts featuring the game**. The game is built to *be* his content, with a streamer overlay, keyboard-driven
  host and replayable rounds, so making that short costs him less effort than his current Minecraft setups.
- Infrastructure is not a meaningful cost (README "Unit cost": ≈$1–5 per million player-episodes). Margin is set by payment fees and support.

## 4. Competitors and alternatives
| Alternative | What it does well | Why Block Party fits Dname's audience better |
|---|---|---|
| **Custom Minecraft/Roblox maps** (what he does now) | Rich 3D worlds, his brand look | Viewers need a PC/console, an account and a server slot, so only a handful can play. Block Party: any phone, a link, hundreds per room. |
| **YouTube Live Playables** (Sep 2025) | Built into YouTube, zero setup | Only the creator plays; viewers watch and chat. In Block Party every viewer plays. |
| **Jackbox-style party packs** | Proven phone-as-controller format that people pay for | Generic content, bought per pack, meant for living rooms. Block Party is free, runs his formats and has a stream overlay. |
| **Kahoot / classroom quiz tools** | Huge classroom reach | Quiz-only (right/wrong answers). Block Party's rounds are social (greed, telepathy, luck), so anyone can win. That is the appeal of his videos. |
| **Chat polls / prediction widgets** | Easy for streamers | One question, no game, no score. Block Party has episodes, a season leaderboard and replays that make shorts. |

The moat is not the technology. It is **his formats + his audience + the weekly final + the season leaderboard**, which a generic tool cannot copy.
(Product descriptions are from each product's public pages. We did not verify current prices, so none are quoted.)

## 5. Costs and risks
- **Costs:** Cloudflare Workers Paid ($5/mo) once past the free tier; payment gateway fees (≈3–10%, assumed 10%); question-pack
  writing and moderation (a few hours a week); a Korean game rating before paid features launch (GRAC/self-rating; **to check**).
- **Minors:** paid features go through a parent (web payment with parental consent, gift cards/vouchers). Free text only appears
  in the "Don't Say It" round: blocklist, 16-character limit and a host veto.
- **Children's privacy:** Korea's PIPA requires a legal guardian's consent to collect personal information from children under 14
  (COPPA has a similar rule for US children under 13). Free play is designed to collect **no personal information**: a nickname and a
  random id stored only on the phone, no accounts, no ads SDKs, no chat. Nicknames shown on stream are filtered (English/Korean).
  Anything that needs an account or a payment (Fan Pass) goes through a guardian. To be confirmed with Extriver's counsel before launch.
- **Creator dependency:** rare uploads would mean fewer players, which is the conservative scenario. The friend-room and classroom
  modes work without new videos.
- **Copying:** the format is easy to copy. The moat is Dname's audience, his weekly final and the season leaderboard, not the code.

## 6. Milestones
1. Month 0–1: Dname plays one episode on stream, posts the clip, and we measure the real join rate (replaces the (A) inputs).
2. Month 2: Fan Pass + cosmetics. First sponsor pitch, with the measured numbers.
3. Month 3+: weekly sponsored final, classroom mode, Korean question packs written with the creator.
