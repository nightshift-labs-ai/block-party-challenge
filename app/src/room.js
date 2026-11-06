// Party room: one Durable Object per 4-letter code. Host screen (TV / stream) + up to 300 phones via WebSocket.
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
  // Hibernatable WebSockets: the object can be evicted from memory between messages, so game state is snapshotted to
  // Durable Object storage on every broadcast and reloaded lazily; the round timer is a storage alarm, not setTimeout.
  constructor(state, env) { this.state = state; this.env = env; this.loaded = false; }

  async load() {
    if (this.loaded) return;
    const g = await this.state.storage.get("g");
    this.players = new Map((g?.players || []).map(p => [p.pid, p]));
    Object.assign(this, { phase: "lobby", round: -1, episode: null, answers: {}, result: null, deadline: 0, noSeason: false }, g ? { phase: g.phase, round: g.round, episode: g.episode, answers: g.answers, result: g.result, deadline: g.deadline, noSeason: g.noSeason } : {});
    this.loaded = true;
  }
  async save() {
    await this.state.storage.put("g", { phase: this.phase, round: this.round, episode: this.episode, answers: this.answers, result: this.result, deadline: this.deadline, noSeason: this.noSeason, players: [...this.players.values()] });
  }
  reset() { this.phase = "lobby"; this.round = -1; this.episode = null; this.answers = {}; this.result = null; this.deadline = 0; this.state.storage.deleteAlarm(); }
  hostWs() { return this.state.getWebSockets("host")[0] || null; }
  playerWs(pid) { return this.state.getWebSockets("p:" + pid)[0] || null; }

  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    if (req.headers.get("upgrade") !== "websocket") return Response.json({ phase: this.phase, players: this.players.size });
    const [client, server] = Object.values(new WebSocketPair());
    const role = url.searchParams.get("role");
    if (role === "host") {
      for (const old of this.state.getWebSockets("host")) try { old.close(1000, "replaced"); } catch {}
      this.state.acceptWebSocket(server, ["host"]); server.serializeAttachment({ role: "host" });
      if (this.phase === "lobby") this.noSeason = url.searchParams.get("practice") === "1";
      this.broadcast();
    } else {
      const err = this.attachPlayer(server, url.searchParams.get("name"), url.searchParams.get("pid"));
      if (err) { server.accept(); server.send(JSON.stringify({ t: "error", msg: err })); server.close(1008, err); }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  attachPlayer(ws, name, pid) {
    name = String(name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12);
    if (!name) return "name required";
    pid = /^[a-z0-9]{8,24}$/.test(pid || "") ? pid : crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    if (!this.players.has(pid)) {
      if (this.players.size >= MAX_PLAYERS) return "room full";
      if (this.phase !== "lobby") return "game already started";
      this.players.set(pid, { pid, name, score: 0 });
    }
    for (const old of this.state.getWebSockets("p:" + pid)) try { old.close(1000, "replaced"); } catch {}
    this.state.acceptWebSocket(ws, ["p:" + pid]); ws.serializeAttachment({ role: "player", pid });
    ws.send(JSON.stringify({ t: "welcome", pid }));
    this.broadcast();
    return null;
  }

  async webSocketMessage(ws, data) {
    await this.load();
    let m; try { m = JSON.parse(data); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    if (a.role === "host") this.onHost(m);
    else if (a.role === "player" && m.t === "answer") this.onAnswer(a.pid, m.v);
  }
  async webSocketClose(ws) { await this.load(); this.broadcast(); }
  async webSocketError(ws) { await this.load(); this.broadcast(); }
  async alarm() { await this.load(); if (this.phase === "question" && Date.now() >= this.deadline) this.reveal(); }

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
    this.state.storage.setAlarm(this.deadline + 300);
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
    if (this.phase !== "question" || pid in this.answers || !this.players.has(pid)) return;
    const r = this.episode[this.round];
    if (!validAnswer(r, v) || Date.now() > this.deadline + 500) return;
    this.answers[pid] = v;
    const active = [...this.players.keys()].filter(id => this.playerWs(id)).length;
    if (Object.keys(this.answers).length >= active) this.reveal(); else this.broadcast();
  }

  reveal() {
    if (this.phase !== "question") return;
    this.state.storage.deleteAlarm();
    const r = this.episode[this.round];
    const res = r.kind === "telepathy" || r.kind === "blockmatch" ? scoreTelepathy(this.answers) : r.kind === "greed" ? scoreGreed(this.answers, r.pot) : r.kind === "lava" ? scoreLava(this.answers, r.lava) : scoreDiamond(this.answers, r.diamond);
    for (const [pid, pts] of Object.entries(res.pts)) { const p = this.players.get(pid); if (p) p.score += pts; }
    this.result = { ...res, answers: this.answers };
    this.phase = "reveal";
    this.broadcast();
  }

  view(forPid, full) {
    const r = this.episode && this.round >= 0 && this.round < this.episode.length ? this.episode[this.round] : null;
    const pub = r && { kind: r.kind, q: r.q, opts: r.opts, qk: r.qk, ok: r.ok, pot: r.pot, maxTake: r.maxTake, secs: r.secs };
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
    this.state.waitUntil?.(new Promise(r => setTimeout(r, 200)));
  }

  flush() {
    const send = (ws, o) => { try { ws?.send(JSON.stringify(o)); } catch {} };
    const online = new Set(this.state.getWebSockets().map(w => w.deserializeAttachment()?.pid).filter(Boolean));
    this.ranked = [...this.players.values()].map(p => ({ pid: p.pid, name: p.name, score: p.score, online: online.has(p.pid) })).sort((a, b) => b.score - a.score);
    send(this.hostWs(), this.view(null, true));
    for (const w of this.state.getWebSockets()) { const a = w.deserializeAttachment(); if (a?.role === "player") send(w, this.view(a.pid)); }
    this.save().catch(() => {});
  }
}
