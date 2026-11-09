import { safeName } from "./namefilter.js";
import { checkSeat } from "./seat.js";
// Party room: one Durable Object per 4-letter code. Host screen (TV / stream) + up to 300 phones via WebSocket.
// Phases: lobby → question → reveal → … → final. Server owns timers and scoring (clients can't cheat the clock).
import { makeEpisode, validAnswer, scoreTelepathy, scoreGreed, scoreDiamond, scoreLava, scoreTaboo, normWord } from "./games.js";
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
  constructor(state, env) { this.state = state; this.env = env; this.loaded = false; state.blockConcurrencyWhile(() => this.load()); }

  // Loaded once per (re)construction under blockConcurrencyWhile, so concurrent joins never see or overwrite half-loaded state.
  load() { return this.loading ||= this._load(); }
  async _load() {
    const g = await this.state.storage.get("g");
    this.players = new Map((g?.players || []).map(p => [p.pid, p]));
    Object.assign(this, { phase: "lobby", round: -1, episode: null, answers: {}, result: null, deadline: 0, noSeason: false, brand: null, final: false, official: false }, g ? { final: !!g.final, official: !!g.official, brand: g.brand || null, phase: g.phase, round: g.round, episode: g.episode, answers: g.answers, result: g.result, deadline: g.deadline, noSeason: g.noSeason } : {});
    this.loaded = true;
  }
  async save() {
    await this.state.storage.put("g", { phase: this.phase, round: this.round, episode: this.episode, answers: this.answers, result: this.result, deadline: this.deadline, noSeason: this.noSeason, final: this.final, official: this.official, brand: this.brand, players: [...this.players.values()] });
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
      // s90: the room code is on stream, so a browser that doesn't hold this host's secret can't take over while the host is connected.
      const hs = url.searchParams.get("hs") || "", cur = this.hostWs();
      if (cur && (cur.deserializeAttachment()?.hs || "") !== hs) { server.accept(); server.send(JSON.stringify({ t: "error", msg: "This room already has a host / 이미 진행자가 있는 방입니다" })); server.close(1008, "host taken"); return new Response(null, { status: 101, webSocket: client }); }
      for (const old of this.state.getWebSockets("host")) try { old.close(1000, "replaced"); } catch {}
      this.state.acceptWebSocket(server, ["host"]); server.serializeAttachment({ role: "host", hs });
      if (this.phase === "lobby") { this.noSeason = url.searchParams.get("practice") === "1"; this.final = url.searchParams.get("final") === "1"; this.official = this.final && !!this.env?.FINAL_HOST_KEY && url.searchParams.get("hk") === this.env.FINAL_HOST_KEY; } // s62: only the creator's host key makes an OFFICIAL final; without it = labelled demo final // s62: weekly final = seat holders only
      this.broadcast();
    } else {
      const seat = url.searchParams.get("seat") ? await checkSeat(this.env || {}, url.searchParams.get("seat")) : null;
      const pidQ = url.searchParams.get("pid") || "", owner = seat && [...this.players.values()].find(p => p.seatId === seat.id);
      const err = this.final && !seat && !this.players.has(pidQ) ? "Weekly Final: seat holders only (win a seat in the Daily Challenge) / 주간 파이널: 좌석 보유자만 입장"
        : owner && owner.pid !== pidQ ? "This seat is already used in this room / 이미 사용된 좌석입니다" // one seat = one player
        : this.attachPlayer(server, url.searchParams.get("name"), url.searchParams.get("pid"), seat);
      if (err) { server.accept(); server.send(JSON.stringify({ t: "error", msg: err })); server.close(1008, err); }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  attachPlayer(ws, name, pid, seat = null) {
    name = String(name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12);
    if (!name) return "Enter a nickname / 닉네임을 입력하세요";
    pid = /^[a-z0-9]{8,24}$/.test(pid || "") ? pid : crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    name = safeName(name, pid); // kids watch the stream: unsafe nicknames become a friendly generated name
    if (!this.players.has(pid)) {
      if (this.players.size >= MAX_PLAYERS) return "This room is full / 방이 가득 찼어요";
      if (this.phase === "final") return "This game has just finished. Wait for the next one! / 이번 판이 끝났어요. 다음 판을 기다려 주세요!"; // late joiners may enter during an episode and play the remaining rounds
      this.players.set(pid, seat ? { pid, name, score: 0, seat: `${seat.date} #${seat.rank}`, seatId: seat.id } : { pid, name, score: 0 });
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
    if (m.t === "start" && this.phase === "lobby" && this.players.size >= 1) { this.episode = makeEpisode(this.players.size);
      const pack = cleanPack(m.pack); if (pack.length) { this.episode = [...pack, ...this.episode.slice(1)].slice(0, 10); this.noSeason = true; } /* s61: Fan Pass demo: host's own questions, never ranked */ if (this.brand?.sq) this.episode[0] = { kind: "telepathy", q: this.brand.sq, opts: this.brand.so, qk: this.brand.sqk, ok: this.brand.sok, secs: 15, sponsored: true }; this.round = -1; this.next(); }
    else if (m.t === "next" && this.phase === "reveal") this.next();
    else if (m.t === "skip" && this.phase === "question") this.reveal();
    else if (m.t === "veto" && this.phase === "reveal" && this.episode?.[this.round]?.kind === "taboo" && typeof m.w === "string") this.veto(m.w);
    else if (m.t === "brand" && this.phase === "lobby") { this.brand = cleanBrand(m); this.broadcast(); }
    else if (m.t === "again" && this.phase === "final") { for (const p of this.players.values()) p.score = 0; this.reset(); this.broadcast(); }
  }

  next() {
    this.round++;
    if (this.round >= this.episode.length) { this.phase = "final"; this.broadcast(); this.recordSeason(); return; }
    this.phase = "question"; this.answers = {}; this.result = null;
    const r = this.episode[this.round];
    if (r.potPer) r.pot = Math.max(r.potMin, Math.round(this.players.size * r.potPer)); // late joiners count, so the pot stays fair
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
    this.answers[pid] = r.kind === "taboo" ? normWord(v) : v;
    const active = [...this.players.keys()].filter(id => this.playerWs(id)).length;
    if (Object.keys(this.answers).length >= active) this.reveal(); else this.broadcast();
  }

  // Host (streamer) rejects a word in the taboo round — off-topic for the category or not OK on stream:
  // its writers lose that round's points and the word disappears from every screen.
  veto(w) {
    const k = w.toLowerCase(), r = this.result; if (!r?.words) return;
    for (const [pid, v] of Object.entries(this.answers)) if (v.toLowerCase() === k) {
      const p = this.players.get(pid); if (p) p.score -= r.pts[pid] || 0; r.pts[pid] = 0; r.verdict[pid] = "vetoed"; }
    r.words = r.words.filter(x => x.w.toLowerCase() !== k);
    r.busted = Object.values(r.verdict).filter(v => v !== "ok").length;
    this.broadcast();
  }

  reveal() {
    if (this.phase !== "question") return;
    this.state.storage.deleteAlarm();
    const r = this.episode[this.round];
    const res = r.kind === "telepathy" || r.kind === "blockmatch" ? scoreTelepathy(this.answers) : r.kind === "greed" ? scoreGreed(this.answers, r.pot) : r.kind === "lava" ? scoreLava(this.answers, r.lava) : r.kind === "taboo" ? scoreTaboo(this.answers) : scoreDiamond(this.answers, r.diamond);
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
      t: "state", phase: this.phase, final: this.final, official: this.official, brand: this.brand, round: this.round, rounds: this.episode?.length || 0, deadline: this.deadline, now: Date.now(),
      current: pub, result: this.phase === "question" || !this.result ? null : full ? this.result : { ...this.result, answers: undefined, verdict: undefined, pts: forPid ? { [forPid]: this.result.pts[forPid] } : {} },
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
    this.ranked = [...this.players.values()].map(p => ({ pid: p.pid, name: p.name, score: p.score, online: online.has(p.pid), ...(p.seat ? { seat: p.seat } : {}) })).sort((a, b) => b.score - a.score);
    send(this.hostWs(), this.view(null, true));
    for (const w of this.state.getWebSockets()) { const a = w.deserializeAttachment(); if (a?.role === "player") send(w, this.view(a.pid)); }
    // Persist on every phase/round change; during a question with many answers, at most once per second.
    const key = this.phase + ":" + this.round, now = Date.now();
    if (key !== this.savedKey || now - (this.savedAt || 0) > 1000) { this.savedKey = key; this.savedAt = now; this.save().catch(() => {}); }
    else if (!this.saveLater) this.saveLater = setTimeout(() => { this.saveLater = null; this.savedAt = Date.now(); this.save().catch(() => {}); }, 1000);
  }
}

// Sponsored/branded episode (set by the host in the lobby): show title, sponsor and prize line on every screen.
// Plain text only, length-capped; prizes are described, never collected or paid through the game.
// Fan Pass demo (s61): the host types up to 5 telepathy questions, one per line: "Question? | A | B | C | D" (2-4 options).
export function cleanPack(pack) {
  const c = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
  return (Array.isArray(pack) ? pack : []).slice(0, 5).map(l => String(l).split("|").map(x => x.trim()))
    .map(([q, ...o]) => ({ kind: "telepathy", q: c(q, 80), opts: o.map(x => c(x, 24)).filter(Boolean).slice(0, 4), secs: 15, custom: true }))
    .filter(r => r.q && r.opts.length >= 2);
}
export function cleanBrand(m) {
  const c = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
  const b = { title: c(m.title, 40), sponsor: c(m.sponsor, 30), prize: c(m.prize, 60) };
  // s61: optional sponsored question (round 1 becomes a telepathy round with the sponsor's question and 2-4 options)
  const so = (Array.isArray(m.so) ? m.so : []).map(o => c(o, 24)).filter(Boolean).slice(0, 4), sq = c(m.sq, 80);
  if (sq && so.length >= 2) Object.assign(b, { sq, so });
  const sok = (Array.isArray(m.sok) ? m.sok : []).map(o => c(o, 24)).slice(0, so.length), sqk = c(m.sqk, 80); // optional Korean text
  if (b.sq && sqk) b.sqk = sqk; if (b.sq && sok.length === so.length && sok.every(Boolean)) b.sok = sok;
  return b.title || b.sponsor || b.prize ? b : null;
}
