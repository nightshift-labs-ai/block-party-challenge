# Block Party Challenge: business model (updated 2026-11-07)

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

### Price anchors (public list prices, checked 2026-11-07)
Our prices sit inside the range people already pay for phone-as-controller and classroom games:

| Product | Public price | Our closest price |
|---|---|---|
| Gimkit Pro (classroom game show), individual teacher | $14.99/month, or $59.88/year ([Gimkit help center](https://help.gimkit.com/en/article/gimkit-pro-faq-14h6d62/)) | Classroom licence ₩9,900/mo ≈ $7.20: under Gimkit's monthly price, above its annual rate ($4.99/mo) |
| Gimkit Groups | $650/year per department (≤20 teachers), $1,000/year per school (same page) | Academy licences (not in the model yet; upside) |
| Blooket Plus (classroom games) | ≈$4.99/month billed yearly, $9.99 monthly (third-party reviews, e.g. [Nibble](https://nibble-app.com/blog/blooket-pricing); Blooket shows prices only in-account) | same range |
| Jackbox Party Pack (phones as controllers, living room) | $24.99–29.99 per pack on Steam, one-time (e.g. [The Jackbox Party Pack](https://store.steampowered.com/app/331670/) $24.99; newer packs $29.99) | Fan Pass ₩4,900/mo ≈ $3.55, cancel any time |

US prices, not Korean ones. They show that a teacher or a family already pays this much for the format. They don't prove Korean demand:
the first Dname Final (milestone 1) is the test for that.

## 2. Funnel (how players arrive)
Public counts (2026-11-06): 270K subscribers, median **≈1.7M views** over the last 50 shorts, but recent uploads are rare and
weaker (13K–755K). The model therefore uses lower view numbers than the median.

1. Dname posts a short that *is* a game round ("Don't say ㄹ", "Find the diamond") and ends with "join this week's final: QR / link in the pinned comment".
2. Viewers play the same round on their phones in the weekly live final. The best moments become his next short.
3. Between finals, the **Daily Challenge** (live now: `/?daily=1`) catches viewers whenever they watch a short. Its shareable 🟩🟨⬛ result brings in friends.
4. Players bring friends into private rooms (Fan Pass), and teachers find it through students.

**Room cap and overflow (honest limit).** One live room holds up to **300 phones** (server cap; load-tested with 200 simulated phones). A short that brings thousands of players cannot fit one final, so the plan is:
- **Everyone** can play the same rounds in the **Daily Challenge**, which has no player cap (one storage object per day, answers are small counters). *Built and live.*
- The weekly live final keeps **300 seats**, given to the week's top Daily Challenge players (a "qualifier" link), so the seats reward the most engaged fans. *Planned, not built yet.*
- If one final is not enough, several rooms can run the same episode in parallel and merge their results into one board (each room is already its own Durable Object). *Planned, not built yet.*

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
| Recent reach* | 700 | ₩0.5M | ₩3.4M ($2.5K) | ₩3.1M | ₩0.62M ($450) |
| Optimistic | 104,600 | ₩22M | ₩242M ($176K) | ₩218M | ₩44M ($32K) |

**Why ₩2M per sponsored episode is a low assumption:** creator-marketing guides quote YouTube sponsorships at "$10 to $50 per 1,000 expected views for a dedicated integration" and price a Short at 0.25–0.5× of an integration ([1of10, Aug 2026](https://www.1of10.com/blog/youtube-sponsorship-rates/)), i.e. roughly $2.5–25 per 1,000 Short views. At the Base 800K views that is ≈$2K–20K (₩2.8M–28M) per sponsored Short; we use ₩2M (≈$1.4K, ≈$1.8 per 1,000 views), below the bottom of that range. These are vendor-blog figures for mostly US channels, not a Korean rate card, so the input stays labelled (A). Korean market check: a Korean business magazine reports that one promotion on a 1M+ subscriber Korean channel commonly costs over ₩100M, and that for startups and SMEs a channel above 300K subscribers is already hard to afford ([Bizhankook, 16 Mar 2026](https://bizhankook.com/articles/31741.html)). That points the same way: ₩2M per episode is well under Korean market prices for a channel this size.

\* **Recent reach** = Base rates, but 24K views per short (the median of his three latest uploads: 755K, 13K, 24K) and **no sponsor deals**.
It is the honest floor if his posting stays as it is now: most of that revenue is classroom licences. The Base case assumes the game
becomes his regular content again (2 game shorts a month at 800K, below his 1.7M 50-short median). That is the bet, and the reason
the product is built to make a short cheap to produce (Make a Short button, recorded "Dname Final").

What the model shows:
- **Sponsorship is the biggest line** in the base case (≈40% of revenue). The game turns his audience into a sellable ad format
  without asking kids to pay. That matters most for a kids' audience.
- Revenue depends on **shorts featuring the game**. The game is built to *be* his content, with a recording overlay (he makes shorts, not streams), keyboard-driven
  host and replayable rounds, so making that short costs him less effort than his current Minecraft setups.
- Infrastructure is not a meaningful cost (README "Unit cost": ≈$1–5 per million player-episodes). Margin is set by payment fees and support.

### Sensitivity: the two inputs we know least (Base scenario, `python3 tools/model.py`)
Year-1 gross revenue, and in brackets the creator's 20% share as an **average per month**:

| Views per short ↓ / join rate → | 0.5% | 1% | 2% |
|---|---|---|---|
| 24K (his recent median) | ₩23.0M (₩345K/mo) | ₩23.4M (₩352K/mo) | ₩24.3M (₩365K/mo) |
| 300K | ₩28.0M (₩420K/mo) | ₩33.4M (₩501K/mo) | ₩44.2M (₩663K/mo) |
| 800K (Base) | ₩37.0M (₩555K/mo) | **₩51.4M (₩771K/mo)** | ₩80.2M (₩1.2M/mo) |

Revenue mix in year 1 (players' Fan Pass + cosmetics / sponsors / classroom licences): Conservative 66/0/34 % · Base 56/39/5 % ·
Recent reach 25/0/75 % · Optimistic 81/16/3 %.

What this tells us, honestly:
- **The model's sponsor income does not scale with views.** At 24K views the table still counts one ₩2M sponsor a month, which is
  unlikely. A brand pays for reach, so the realistic low-views case is the "Recent reach" row (no sponsors, ₩3.4M a year).
- **For Dname this is extra income, not a replacement for brand deals.** In the Base case his share averages about ₩0.77M a month,
  far below one brand deal for a channel his size (Korean press: ₩100M+ per promotion for 1M+ channels). What the game gives him is
  a **new format he can sell**: "play my brand's round with Dname", where the sponsor pays for minutes of play instead of a 5-second
  mention. The more sponsored finals he books, the more both sides earn.
- **Classroom licences are the least proven line.** They are only 5% of the Base case, but 75% of "Recent reach". We keep them because
  classroom mode works without new uploads, but we would test them with 10 academies before counting on them.

## 4. Competitors and alternatives
| Alternative | What it does well | Why Block Party fits Dname's audience better |
|---|---|---|
| **Custom Minecraft/Roblox maps** (what he does now) | Rich 3D worlds, his brand look | Viewers need a PC/console, an account and a server slot, so only a handful can play. Block Party: any phone, a link, hundreds per room. |
| **YouTube Live Playables** (Sep 2025) | Built into YouTube, zero setup | Only the creator plays; viewers watch and chat. In Block Party every viewer plays. |
| **Jackbox-style party packs** | Proven phone-as-controller format that people pay for | Generic content, bought per pack, meant for living rooms. Block Party is free, runs his formats and has a stream overlay. |
| **Kahoot / classroom quiz tools** | Huge classroom reach | Quiz-only (right/wrong answers). Block Party's rounds are social (greed, telepathy, luck), so anyone can win. That is the appeal of his videos. |
| **Chat polls / prediction widgets** | Easy for streamers | One question, no game, no score. Block Party has episodes, a season leaderboard and a one-click **"Make a Short"** button that turns each episode into a 9:16 recap video. |

The moat is not the technology. It is **his formats + his audience + the weekly final + the season leaderboard**, which a generic tool cannot copy.
(Product descriptions are from each product's public pages. Gimkit, Blooket and Jackbox prices are quoted with sources in section 1; other products were not price-checked.)

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
