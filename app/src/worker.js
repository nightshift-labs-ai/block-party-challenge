import { safeName } from "./namefilter.js";
import { seatSig, seatCode, checkSeat } from "./seat.js";
// Extriver prototype backend (Cloudflare Worker, free plan). Static game/app files come from ./public.
// Endpoints: GET /health, GET /api/leaderboard?board=<id>, POST /api/score {board,name,score}
import { Room, seasonId } from "./room.js";
import { kstDate, dailyRounds, validAnswer, scoreDaily, DAILY_CROWD } from "./games.js";
export { Room };
const VERSION = "0.4.0";
const MAX_NAME = 16, MAX_ENTRIES = 50, QUAL_SEATS = 3;
// The weekly final is a Saturday, 20:00 KST (Korean dates).
// s63: seats are handed out only after the qualifying day closes (final crowd counts), so the final is the Saturday on or after the NEXT day.
export function finalFor(date) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7)); return d.toISOString().slice(0, 10) + " 20:00 KST"; }
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });

function cleanName(n) {
  const c = String(n || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, MAX_NAME) || "anon";
  return safeName(c, c).slice(0, MAX_NAME);
}
function cleanBoard(b) {
  const s = String(b || "main").toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(s) ? s : null;
}

// Simple per-IP fixed-window rate limit kept in isolate memory (best effort; KV is too slow/limited for this).
const hits = new Map();
function limited(ip, max = 20, windowMs = 60_000) {
  const now = Date.now(), w = hits.get(ip);
  if (!w || now - w.t > windowMs) { hits.set(ip, { t: now, n: 1 }); return false; }
  w.n++; if (hits.size > 5000) hits.clear();
  return w.n > max;
}

export async function handle(req, env) {
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    let kv = "absent";
    if (env.SCORES) { try { await env.SCORES.get("__ping"); kv = "ok"; } catch { kv = "error"; } }
    let db = "absent"; // s58: also check Durable Object storage (leaderboards/rooms), so the status page can't be green while boards fail
    if (env.BOARD) { try { const r = await env.BOARD.get(env.BOARD.idFromName("health-check")).fetch("https://do/"); await r.text(); db = r.ok ? "ok" : "error"; } catch { db = "error"; } }
    // s61: liveness vs readiness. Games run without the leaderboard DB (rooms are their own Durable Objects), so a DB failure is
    // "degraded" (200) for the uptime monitor, which tracks it separately; ?ready=1 is the strict readiness check (503 on any failure).
    const down = kv === "error", degraded = db === "error";
    const strict = url.searchParams.get("ready") === "1";
    return json({ ok: !down, degraded, version: VERSION, kv, db, time: new Date().toISOString() }, down || (strict && degraded) ? 503 : 200);
  }
  if (url.pathname === "/api/leaderboard" && req.method === "GET") {
    const board = cleanBoard(url.searchParams.get("board") === "season" ? seasonId() : url.searchParams.get("board"));
    if (!board) return json({ error: "bad board" }, 400);
    let list;
    try { list = env.BOARD ? await (await env.BOARD.get(env.BOARD.idFromName(board)).fetch("https://do/")).json()
      : env.SCORES ? (await env.SCORES.get("lb:" + board, "json")) || [] : []; }
    catch { return json({ board, entries: [], unavailable: true }); } // storage hiccup (e.g. platform quota): home page shows a friendly line instead of hanging on "…"
    return json({ board, entries: list.slice(0, 20) }, 200, { "cache-control": "public, max-age=5" });
  }
  if (url.pathname === "/api/score" && req.method === "POST") {
    // s58: in production (Durable Object boards) season scores are written ONLY by game rooms (room.js); the public endpoint is closed
    if (env.BOARD) return json({ error: "scores are recorded by game rooms" }, 403);
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (limited(ip)) return json({ error: "slow down" }, 429);
    let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const board = cleanBoard(body.board), score = Math.floor(Number(body.score));
    if (!board || !Number.isFinite(score) || score < 0 || score > 1e9) return json({ error: "bad input" }, 400);
    if (env.BOARD) {
      const r = await env.BOARD.get(env.BOARD.idFromName(board)).fetch("https://do/", { method: "POST", body: JSON.stringify({ name: cleanName(body.name), score }) });
      return json({ ok: true, ...(await r.json()) });
    }
    if (!env.SCORES) return json({ error: "storage not configured" }, 503);
    const key = "lb:" + board;
    const list = (await env.SCORES.get(key, "json")) || [];
    list.push({ name: cleanName(body.name), score, at: Date.now() });
    list.sort((a, b) => b.score - a.score || a.at - b.at);
    const top = list.slice(0, MAX_ENTRIES);
    await env.SCORES.put(key, JSON.stringify(top));
    const rank = top.findIndex(e => e.score === score && e.name === cleanName(body.name)) + 1;
    return json({ ok: true, rank: rank || null });
  }
  // Daily Challenge: GET → today's public rounds (no hidden cells); POST {round, v, tok} → crowd counts, your points, the reveal.
  if (url.pathname === "/api/daily" && req.method === "GET") {
    const date = kstDate(), rounds = dailyRounds(date, env.SEAT_SECRET || "").map(r => ({ kind: r.kind, q: r.q, opts: r.opts, qk: r.qk, ok: r.ok }));
    return json({ date, rounds });
  }
  if (url.pathname === "/api/daily/answer" && req.method === "POST" && env.DAILY) {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (limited("daily:" + ip, 60)) return json({ error: "slow down" }, 429);
    let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const date = kstDate(), rounds = dailyRounds(date, env.SEAT_SECRET || ""), i = body.round, r = rounds[i], tok = String(body.tok || "");
    if (!r || !validAnswer(r, body.v) || !/^[a-z0-9]{8,32}$/.test(tok)) return json({ error: "bad input" }, 400);
    const res = await (await env.DAILY.get(env.DAILY.idFromName("daily-" + date)).fetch("https://do/", { method: "POST", body: JSON.stringify({ round: i, v: body.v, tok, r: { kind: r.kind, diamond: r.diamond, lava: r.lava } }) })).json();
    const v = res.v ?? body.v; // a repeat answer keeps the first one
    return json({ date, round: i, v, counts: res.counts, total: res.total, pts: res.pts ?? scoreDaily(r, v, res.counts, res.total), diamond: r.diamond, lava: r.lava });
  }
  // s62 Qualifier: after all 5 daily rounds a player can enter today's table with a nickname. Points are the ones fixed on the
  // server at answer time (not sent by the client). Top QUAL_SEATS of each Korean day get a signed seat link for the weekly final.
  if (url.pathname === "/api/daily/finish" && req.method === "POST" && env.DAILY) {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (limited("fin:" + ip, 10)) return json({ error: "slow down" }, 429);
    let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const tok = String(body.tok || ""), date = kstDate();
    if (!/^[a-z0-9]{8,32}$/.test(tok)) return json({ error: "bad input" }, 400);
    const res = await (await env.DAILY.get(env.DAILY.idFromName("daily-" + date)).fetch("https://do/finish", { method: "POST", body: JSON.stringify({ tok, name: cleanName(body.name) }) })).json();
    if (res.error) return json(res, 400);
    // s63: today's rank is PROVISIONAL (crowd points move as more people play); seats come from /api/daily/result after midnight KST
    return json({ date, ...res, seats: QUAL_SEATS, provisional: true, closesAt: date + " 24:00 KST", seat: null });
  }
  // s63: final result of a CLOSED Korean day (immutable: answers/entries only ever go to today's table). Top QUAL_SEATS get a seat link.
  if (url.pathname === "/api/daily/result" && req.method === "GET" && env.DAILY) {
    const date = url.searchParams.get("date") || "", tok = url.searchParams.get("tok") || "";
    if (!/^\d{4}-\d\d-\d\d$/.test(date) || !/^[a-z0-9]{8,32}$/.test(tok)) return json({ error: "bad input" }, 400);
    if (date >= kstDate()) return json({ date, open: true, closesAt: date + " 24:00 KST" });
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (limited("res:" + ip, 30)) return json({ error: "slow down" }, 429);
    let res; try { res = await (await env.DAILY.get(env.DAILY.idFromName("daily-" + date)).fetch("https://do/result", { method: "POST", body: JSON.stringify({ tok }) })).json(); }
    catch { return json({ date, unavailable: true }, 503); }
    if (!res.rank) return json({ date, entered: false });
    const seat = res.rank <= QUAL_SEATS ? await seatCode(env, date, res.rank, tok) : null;
    return json({ date, entered: true, total: res.total, rank: res.rank, players: res.players, seats: QUAL_SEATS, seat, final: seat ? finalFor(date) : undefined });
  }
  if (url.pathname === "/api/daily/top" && req.method === "GET" && env.DAILY) {
    const date = /^\d{4}-\d\d-\d\d$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : kstDate();
    let top; try { top = await (await env.DAILY.get(env.DAILY.idFromName("daily-" + date)).fetch("https://do/top")).json(); }
    catch { return json({ date, top: [], unavailable: true }); }
    return json({ date, seats: QUAL_SEATS, ...top }, 200, { "cache-control": "public, max-age=10" });
  }
  if (url.pathname === "/api/seat" && req.method === "GET") { // checks a seat link: <date>.<rank>.<id>.<sig>
    const seat = await checkSeat(env, url.searchParams.get("s")); // same signature + expiry check as the final room
    return json(seat ? { valid: true, date: seat.date, rank: seat.rank, final: finalFor(seat.date) } : { valid: false });
  }
  if (url.pathname === "/api/room" && req.method === "POST" && env.ROOM) {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (limited("room:" + ip, 10)) return json({ error: "slow down" }, 429);
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let code = "";
    for (const b of crypto.getRandomValues(new Uint8Array(4))) code += A[b % A.length];
    return json({ code });
  }
  const m = url.pathname.match(/^\/api\/room\/([A-Z]{4})\/(ws|info)$/);
  if (m && env.ROOM) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
  return env.ASSETS ? env.ASSETS.fetch(req) : new Response("not found", { status: 404 });
}

// Leaderboard storage: one SQLite-backed Durable Object per board (free plan; strongly consistent, no KV write cap).
export class Board {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS s (name TEXT, score INTEGER, at INTEGER)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS si ON s (score DESC, at)");
  }
  async fetch(req) {
    if (req.method === "POST") {
      const { name, score } = await req.json(), at = Date.now();
      this.sql.exec("INSERT INTO s VALUES (?,?,?)", name, score, at);
      const n = this.sql.exec("SELECT COUNT(*) AS c FROM s").one().c;
      if (n > 500) this.sql.exec("DELETE FROM s WHERE rowid NOT IN (SELECT rowid FROM s ORDER BY score DESC, at LIMIT 200)");
      const rank = this.sql.exec("SELECT COUNT(*) AS c FROM s WHERE score > ? OR (score = ? AND at < ?)", score, score, at).one().c + 1;
      return Response.json({ rank });
    }
    return Response.json(this.sql.exec("SELECT name, score, at FROM s ORDER BY score DESC, at LIMIT 20").toArray());
  }
}

// Daily Challenge aggregate: one SQLite Durable Object per Korean day; counts per (round, answer), one answer per token per round.
export class Daily {
  constructor(state) {
    this.state = state; this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS c (round INTEGER, v INTEGER, n INTEGER, PRIMARY KEY (round, v))");
    this.sql.exec("CREATE TABLE IF NOT EXISTS seen (tok TEXT, round INTEGER, v INTEGER, PRIMARY KEY (tok, round))");
    try { this.sql.exec("ALTER TABLE seen ADD COLUMN pts INTEGER"); } catch {} // s62: points fixed at answer time (qualifier)
    this.sql.exec("CREATE TABLE IF NOT EXISTS fin (tok TEXT PRIMARY KEY, name TEXT, total INTEGER, at INTEGER)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS fi ON fin (total DESC, at)");
  }
  async alarm() { await this.state.storage.deleteAll(); } // the day's table, tokens and counts are deleted after 8 days
  // s63 fair crowd scoring: telepathy/blockmatch points are recomputed from the CURRENT crowd counts (the final counts once the day
  // has closed), so early players aren't judged against a tiny crowd. Diamond/lava points are fixed at answer time.
  // One SQL pass over the entered players, cached until the next answer/entry (keeps Durable Object rows-read low).
  standings() {
    if (this.cache && !this.dirty) return this.cache;
    const crowd = DAILY_CROWD.join(",");
    const rows = this.sql.exec(`SELECT f.tok AS tok, f.name AS name, f.at AS at,
        SUM(CASE WHEN s.round IN (${crowd}) THEN CAST(ROUND(100.0 * COALESCE(c.n, 0) / MAX(1, t.tot)) AS INTEGER) ELSE COALESCE(s.pts, 0) END) AS total
      FROM fin f JOIN seen s ON s.tok = f.tok
      LEFT JOIN c ON c.round = s.round AND c.v = s.v
      LEFT JOIN (SELECT round, SUM(n) AS tot FROM c GROUP BY round) t ON t.round = s.round
      GROUP BY f.tok ORDER BY total DESC, f.at`).toArray();
    const rank = new Map(rows.map((r, i) => [r.tok, i + 1]));
    this.cache = { rows, rank }; this.dirty = false;
    return this.cache;
  }
  top() { const { rows } = this.standings(); return { top: rows.slice(0, 10).map(r => ({ name: r.name, total: r.total })), players: rows.length }; }
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/top") return Response.json(this.top());
    if (path === "/finish") { // one entry per token per day; needs all 5 rounds answered
      const { tok, name } = await req.json();
      let me = this.sql.exec("SELECT total, at FROM fin WHERE tok = ?", tok).toArray()[0];
      if (!me) {
        const r = this.sql.exec("SELECT COUNT(*) AS n, SUM(COALESCE(pts, 0)) AS t FROM seen WHERE tok = ?", tok).one();
        if (r.n < 5) return Response.json({ error: "play all 5 rounds first" });
        me = { total: r.t, at: Date.now() };
        this.sql.exec("INSERT INTO fin VALUES (?,?,?,?)", tok, name, me.total, me.at);
        if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 8 * 864e5); // s62: nicknames kept ~1 week (OPS privacy)
      }
      this.dirty = true;
      const st = this.standings(), mine = st.rows[st.rank.get(tok) - 1];
      return Response.json({ total: mine ? mine.total : me.total, rank: st.rank.get(tok), ...this.top() });
    }
    if (path === "/result") { // a closed day: same standings, nothing changes any more
      const { tok } = await req.json(), st = this.standings(), i = st.rank.get(tok);
      return Response.json(i ? { rank: i, total: st.rows[i - 1].total, players: st.rows.length } : {});
    }
    const { round, v, tok, r } = await req.json();
    const prev = this.sql.exec("SELECT v, pts FROM seen WHERE tok = ? AND round = ?", tok, round).toArray()[0];
    if (!prev) this.sql.exec("INSERT INTO c VALUES (?,?,1) ON CONFLICT(round, v) DO UPDATE SET n = n + 1", round, v);
    const counts = {}; let total = 0;
    for (const row of this.sql.exec("SELECT v, n FROM c WHERE round = ?", round)) { counts[row.v] = row.n; total += row.n; }
    const pts = prev ? prev.pts : r ? scoreDaily(r, v, counts, total) : null;
    if (!prev) this.sql.exec("INSERT INTO seen VALUES (?,?,?,?)", tok, round, v, pts);
    if (!prev) this.dirty = true;
    return Response.json({ counts, total, v: prev ? prev.v : v, pts: pts ?? undefined });
  }
}

// Last-resort guard: any storage/platform failure becomes a clear JSON 503 instead of a raw Cloudflare 1101 page.
export default { async fetch(req, env) { try { return await handle(req, env); } catch (e) { console.error("unhandled", String(e?.message || e).slice(0, 200)); return json({ error: "Server is busy, please try again in a minute. / 잠시 후 다시 시도해 주세요." }, 503); } } };
