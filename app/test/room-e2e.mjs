// E2E: node test/room-e2e.mjs <base-url>  — host + 3 bots play a full episode.
const base = process.argv[2] || "http://localhost:8799";
const N = +(process.argv[3] || 3); const t0 = Date.now();
const wsBase = base.replace(/^http/, "ws");
const { code } = await (await fetch(base + "/api/room", { method: "POST" })).json();
const open = (q) => new Promise((res, rej) => { const w = new WebSocket(`${wsBase}/api/room/${code}/ws?${q}`); w.last = null; w.onmessage = e => { w.last = JSON.parse(e.data); w.onmsg?.(w.last); }; w.onopen = () => res(w); w.onerror = rej; });
const host = await open(process.env.SEASON === "1" ? "role=host" : "role=host&practice=1"); // practice rooms never touch the season board
const bots = [];
const names = N === 3 ? ["Ana", "Bo", "Cy"] : Array.from({ length: N }, (_, i) => "bot" + i);
const lat = [];
await Promise.all(names.map(async n => {
  const b = await open("name=" + n); bots.push(b);
  b.onmsg = s => { if (s.t === "state" && s.phase === "question" && !s.answered.includes(s.you)) {
    const c = s.current; const v = c.kind === "telepathy" ? 0 : c.kind === "greed" ? 2 + (bots.indexOf(b) % 3) : 12;
    b.sentAt = Date.now(); b.send(JSON.stringify({ t: "answer", v })); }
    if (s.t === "state" && s.phase === "reveal" && b.sentAt) { lat.push(Date.now() - b.sentAt); b.sentAt = 0; } };
}));
console.log(`${N} players joined in ${Date.now() - t0} ms`);
await new Promise(r => setTimeout(r, 300));
const rounds = [];
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error("timeout, last phase " + host.last?.phase)), 60000);
  host.onmsg = s => {
    if (s.phase === "reveal") { rounds.push(s.current.kind + (s.answeredCount < s.playerCount ? `(${s.answeredCount}/${s.playerCount})` : "")); setTimeout(() => host.send(JSON.stringify({ t: "next" })), 50); }
    if (s.phase === "final") { clearTimeout(to); res(); }
  };
  host.send(JSON.stringify({ t: "start" }));
});
const fin = host.last.players.slice(0, 3).map(p => `${p.name}:${p.score}`).join(" ");
lat.sort((a, b) => a - b);
console.log(`answer→reveal latency over ${lat.length} samples: p50 ${lat[lat.length >> 1]} ms, p95 ${lat[Math.floor(lat.length * 0.95)]} ms; playerCount ${host.last.playerCount}`);
console.log("code", code, "rounds", rounds.join(","), "final", fin);
if (rounds.length !== 7) { console.log("FAIL"); process.exit(1); }
console.log("E2E PASSED"); process.exit(0);
