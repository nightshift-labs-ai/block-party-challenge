// E2E: node test/room-e2e.mjs <base-url>  — host + 3 bots play a full episode.
const base = process.argv[2] || "http://localhost:8799";
const wsBase = base.replace(/^http/, "ws");
const { code } = await (await fetch(base + "/api/room", { method: "POST" })).json();
const open = (q) => new Promise((res, rej) => { const w = new WebSocket(`${wsBase}/api/room/${code}/ws?${q}`); w.last = null; w.onmessage = e => { w.last = JSON.parse(e.data); w.onmsg?.(w.last); }; w.onopen = () => res(w); w.onerror = rej; });
const host = await open("role=host");
const bots = [];
for (const n of ["Ana", "Bo", "Cy"]) {
  const b = await open("name=" + n); bots.push(b);
  b.onmsg = s => { if (s.t === "state" && s.phase === "question" && !s.answered.includes(s.you)) {
    const c = s.current; const v = c.kind === "telepathy" ? 0 : c.kind === "greed" ? 2 + bots.indexOf(b) : 12;
    b.send(JSON.stringify({ t: "answer", v })); } };
}
await new Promise(r => setTimeout(r, 300));
const rounds = [];
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error("timeout, last phase " + host.last?.phase)), 20000);
  host.onmsg = s => {
    if (s.phase === "reveal") { rounds.push(s.current.kind); setTimeout(() => host.send(JSON.stringify({ t: "next" })), 50); }
    if (s.phase === "final") { clearTimeout(to); res(); }
  };
  host.send(JSON.stringify({ t: "start" }));
});
const fin = host.last.players.map(p => `${p.name}:${p.score}`).join(" ");
console.log("code", code, "rounds", rounds.join(","), "final", fin);
if (rounds.length !== 5) { console.log("FAIL"); process.exit(1); }
console.log("E2E PASSED"); process.exit(0);
