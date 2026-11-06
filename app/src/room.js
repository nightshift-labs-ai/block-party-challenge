// Party room: one Durable Object per 4-letter code. Host screen (TV / stream) + up to 12 phones via WebSocket.
// Phases: lobby → question → reveal → … → final. Server owns timers and scoring (clients can't cheat the clock).
import { makeEpisode, validAnswer, scoreTelepathy, scoreGreed, scoreDiamond, scoreLava } from "./games.js";
export function seasonId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `season-${y}-w${String(w).padStart(2, "0")}`;
}
const MAX_PLAYERS = 300; // streamer mode: a creator's viewers join one room

export class Room {
  constructor(state, env) { this.state = state; this.env = env; this.host = null; this.players = new Map(); this.reset(); }
  reset() { this.phase = "lobby"; this.round = -1; this.episode = null; this.answers = {}; this.result = null; this.deadline = 0; clearTimeout(this.timer); }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get("upgrade") !== "websocket") return Response.json({ phase: this.phase, players: this.players.size });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const role = url.searchParams.get("role");
    if (role === "host") { this.noSeason = url.searchParams.get("practice") === "1"; this.attachHost(server); }
    else {
      const err = this.attachPlayer(server, url.searchParams.get("name"), url.searchParams.get("pid"));
      if (err) { server.send(JSON.stringify({ t: "error", msg: err })); server.close(1008, err); }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  attachHost(ws) {
    if (this.host) try { this.host.close(1000, "replaced"); } catch {}
    this.host = ws;
    ws.addEventListener("message", e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onHost(m); });
    ws.addEventListener("close", () => { if (this.host === ws) this.host = null; });
    this.broadcast();
  }

  attachPlayer(ws, name, pid) {
    name = String(name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12);
    if (!name) return "name required";
    pid = /^[a-z0-9]{8,24}$/.test(pid || "") ? pid : crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    let p = this.players.get(pid);
    if (!p) {
      if (this.players.size >= MAX_PLAYERS) return "room full";
      if (this.phase !== "lobby") return "game already started";
      p = { pid, name, score: 0, ws: null };
      this.players.set(pid, p);
    }
    if (p.ws) try { p.ws.close(1000, "replaced"); } catch {}
    p.ws = ws;
    ws.send(JSON.stringify({ t: "welcome", pid }));
    ws.addEventListener("message", e => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.t === "answer") this.onAnswer(pid, m.v); });
    ws.addEventListener("close", () => { if (p.ws === ws) p.ws = null; this.broadcast(); });
    this.broadcast();
    return null;
  }

  onHost(m) {
    if (m.t === "start" && this.phase === "lobby" && this.players.size >= 1) { this.episode = makeEpisode(this.players.size); this.round = -1; this.next(); }
    else if (m.t === "next" && this.phase === "reveal") this.next();
    else if (m.t === "skip" && this.phase === "question") this.reveal();
    else if (m.t === "again" && this.phase === "final") { for (const p of this.players.values()) p.score = 0; this.reset(); this.broadcast(); }
  }

  next() {
    this.round++;
    if (this.round >= this.episode.length) { this.phase = "final"; this.broadcast(); this.recordSeason(); return; }
    this.phase = "question"; this.answers = {}; this.result = null;
    const r = this.episode[this.round];
    this.deadline = Date.now() + r.secs * 1000;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.reveal(), r.secs * 1000 + 300);
    this.broadcast();
  }

  // Weekly season leaderboard: each finished episode submits its top 10 to the Board DO "season-<ISO week>".
  async recordSeason() {
    if (!this.env?.BOARD || this.noSeason) return;
    const board = seasonId(), stub = this.env.BOARD.get(this.env.BOARD.idFromName(board));
    const top = [...this.players.values()].filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
    for (const p of top) try { await stub.fetch("https://do/", { method: "POST", body: JSON.stringify({ name: p.name, score: p.score }) }); } catch {}
  }

  onAnswer(pid, v) {
    if (this.phase !== "question" || pid in this.answers) return;
    const r = this.episode[this.round];
    if (!validAnswer(r, v) || Date.now() > this.deadline + 500) return;
    this.answers[pid] = v;
    const active = [...this.players.values()].filter(p => p.ws).length;
    if (Object.keys(this.answers).length >= active) this.reveal(); else this.broadcast();
  }

  reveal() {
    if (this.phase !== "question") return;
    clearTimeout(this.timer);
    const r = this.episode[this.round];
    const res = r.kind === "telepathy" || r.kind === "blockmatch" ? scoreTelepathy(this.answers) : r.kind === "greed" ? scoreGreed(this.answers, r.pot) : r.kind === "lava" ? scoreLava(this.answers, r.lava) : scoreDiamond(this.answers, r.diamond);
    for (const [pid, pts] of Object.entries(res.pts)) this.players.get(pid).score += pts;
    this.result = { ...res, answers: this.answers };
    this.phase = "reveal";
    this.broadcast();
  }

  view(forPid, full) {
    const r = this.episode && this.round >= 0 && this.round < this.episode.length ? this.episode[this.round] : null;
    const pub = r && { kind: r.kind, q: r.q, opts: r.opts, pot: r.pot, maxTake: r.maxTake, secs: r.secs };
    if (r && this.phase !== "question" && r.kind === "diamond") pub.diamond = r.diamond; // hidden until reveal
    return {
      t: "state", phase: this.phase, round: this.round, rounds: this.episode?.length || 0, deadline: this.deadline, now: Date.now(),
      current: pub, result: this.phase === "question" || !this.result ? null : full ? this.result : { ...this.result, answers: undefined, pts: forPid ? { [forPid]: this.result.pts[forPid] } : {} },
      answered: full ? Object.keys(this.answers) : forPid && forPid in this.answers ? [forPid] : [],
      answeredCount: Object.keys(this.answers).length, playerCount: this.players.size,
      players: this.ranked.slice(0, 50).concat(forPid && !this.ranked.slice(0, 50).some(p => p.pid === forPid) ? this.ranked.filter(p => p.pid === forPid) : []),
      rank: forPid ? this.ranked.findIndex(p => p.pid === forPid) + 1 : null,
      you: forPid || null,
    };
  }

  broadcast() {
    // Coalesce bursts (e.g. 300 answers in a second) into one fan-out every 120 ms.
    if (this.pending) return;
    this.pending = setTimeout(() => { this.pending = null; this.flush(); }, this.players.size > 20 ? 120 : 0);
  }

  flush() {
    const send = (ws, o) => { try { ws?.send(JSON.stringify(o)); } catch {} };
    this.ranked = [...this.players.values()].map(p => ({ pid: p.pid, name: p.name, score: p.score, online: !!p.ws })).sort((a, b) => b.score - a.score);
    send(this.host, this.view(null, true));
    for (const p of this.players.values()) send(p.ws, this.view(p.pid));
  }
}
