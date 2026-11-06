// Party room: one Durable Object per 4-letter code. Host screen (TV / stream) + up to 12 phones via WebSocket.
// Phases: lobby → question → reveal → … → final. Server owns timers and scoring (clients can't cheat the clock).
import { makeEpisode, validAnswer, scoreTelepathy, scoreGreed, scoreDiamond } from "./games.js";
const MAX_PLAYERS = 12;

export class Room {
  constructor(state) { this.state = state; this.host = null; this.players = new Map(); this.reset(); }
  reset() { this.phase = "lobby"; this.round = -1; this.episode = null; this.answers = {}; this.result = null; this.deadline = 0; clearTimeout(this.timer); }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get("upgrade") !== "websocket") return Response.json({ phase: this.phase, players: this.players.size });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const role = url.searchParams.get("role");
    if (role === "host") this.attachHost(server);
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
    if (this.round >= this.episode.length) { this.phase = "final"; this.broadcast(); return; }
    this.phase = "question"; this.answers = {}; this.result = null;
    const r = this.episode[this.round];
    this.deadline = Date.now() + r.secs * 1000;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.reveal(), r.secs * 1000 + 300);
    this.broadcast();
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
    const res = r.kind === "telepathy" ? scoreTelepathy(this.answers) : r.kind === "greed" ? scoreGreed(this.answers, r.pot) : scoreDiamond(this.answers, r.diamond);
    for (const [pid, pts] of Object.entries(res.pts)) this.players.get(pid).score += pts;
    this.result = { ...res, answers: this.answers };
    this.phase = "reveal";
    this.broadcast();
  }

  view(forPid) {
    const r = this.episode && this.round >= 0 && this.round < this.episode.length ? this.episode[this.round] : null;
    const pub = r && { kind: r.kind, q: r.q, opts: r.opts, pot: r.pot, maxTake: r.maxTake, secs: r.secs };
    if (r && this.phase !== "question" && r.kind === "diamond") pub.diamond = r.diamond; // hidden until reveal
    return {
      t: "state", phase: this.phase, round: this.round, rounds: this.episode?.length || 0, deadline: this.deadline, now: Date.now(),
      current: pub, result: this.phase === "question" ? null : this.result,
      answered: Object.keys(this.answers),
      players: [...this.players.values()].map(p => ({ pid: p.pid, name: p.name, score: p.score, online: !!p.ws })).sort((a, b) => b.score - a.score),
      you: forPid || null,
    };
  }

  broadcast() {
    const send = (ws, o) => { try { ws?.send(JSON.stringify(o)); } catch {} };
    send(this.host, this.view(null));
    for (const p of this.players.values()) send(p.ws, this.view(p.pid));
  }
}
