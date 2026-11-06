import { safeName } from "./namefilter.js";
// Extriver prototype backend (Cloudflare Worker, free plan). Static game/app files come from ./public.
// Endpoints: GET /health, GET /api/leaderboard?board=<id>, POST /api/score {board,name,score}
import { Room, seasonId } from "./room.js";
import { kstDate, dailyRounds, validAnswer, scoreDaily } from "./games.js";
export { Room };
const VERSION = "0.3.0";
const MAX_NAME = 16, MAX_ENTRIES = 50;
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
    return json({ ok: kv !== "error", version: VERSION, kv, time: new Date().toISOString() }, kv === "error" ? 503 : 200);
  }
  if (url.pathname === "/api/leaderboard" && req.method === "GET") {
    const board = cleanBoard(url.searchParams.get("board") === "season" ? seasonId() : url.searchParams.get("board"));
    if (!board) return json({ error: "bad board" }, 400);
    const list = env.BOARD ? await (await env.BOARD.get(env.BOARD.idFromName(board)).fetch("https://do/")).json()
      : env.SCORES ? (await env.SCORES.get("lb:" + board, "json")) || [] : [];
    return json({ board, entries: list.slice(0, 20) }, 200, { "cache-control": "public, max-age=5" });
  }
  if (url.pathname === "/api/score" && req.method === "POST") {
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
    const date = kstDate(), rounds = dailyRounds(date).map(r => ({ kind: r.kind, q: r.q, opts: r.opts, qk: r.qk, ok: r.ok }));
    return json({ date, rounds });
  }
  if (url.pathname === "/api/daily/answer" && req.method === "POST" && env.DAILY) {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (limited("daily:" + ip, 60)) return json({ error: "slow down" }, 429);
    let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const date = kstDate(), rounds = dailyRounds(date), i = body.round, r = rounds[i], tok = String(body.tok || "");
    if (!r || !validAnswer(r, body.v) || !/^[a-z0-9]{8,32}$/.test(tok)) return json({ error: "bad input" }, 400);
    const res = await (await env.DAILY.get(env.DAILY.idFromName("daily-" + date)).fetch("https://do/", { method: "POST", body: JSON.stringify({ round: i, v: body.v, tok }) })).json();
    const v = res.v ?? body.v; // a repeat answer keeps the first one
    return json({ date, round: i, v, counts: res.counts, total: res.total, pts: scoreDaily(r, v, res.counts, res.total), diamond: r.diamond, lava: r.lava });
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
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS c (round INTEGER, v INTEGER, n INTEGER, PRIMARY KEY (round, v))");
    this.sql.exec("CREATE TABLE IF NOT EXISTS seen (tok TEXT, round INTEGER, v INTEGER, PRIMARY KEY (tok, round))");
  }
  async fetch(req) {
    const { round, v, tok } = await req.json();
    const prev = this.sql.exec("SELECT v FROM seen WHERE tok = ? AND round = ?", tok, round).toArray()[0];
    if (!prev) {
      this.sql.exec("INSERT INTO seen VALUES (?,?,?)", tok, round, v);
      this.sql.exec("INSERT INTO c VALUES (?,?,1) ON CONFLICT(round, v) DO UPDATE SET n = n + 1", round, v);
    }
    const counts = {}; let total = 0;
    for (const row of this.sql.exec("SELECT v, n FROM c WHERE round = ?", round)) { counts[row.v] = row.n; total += row.n; }
    return Response.json({ counts, total, v: prev ? prev.v : v });
  }
}

export default { fetch: (req, env) => handle(req, env) };
