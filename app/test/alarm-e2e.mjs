// Timer path: a player who never answers → the storage alarm must reveal the round. node test/alarm-e2e.mjs <base>
const base = process.argv[2] || "http://localhost:8799", wsb = base.replace(/^http/, "ws");
const { code } = await (await fetch(base + "/api/room", { method: "POST" })).json();
const open = q => new Promise((res, rej) => { const w = new WebSocket(`${wsb}/api/room/${code}/ws?${q}`); w.onmessage = e => { w.last = JSON.parse(e.data); w.on?.(w.last); }; w.onopen = () => res(w); w.onerror = rej; });
const host = await open("role=host&practice=1"); await open("name=Idle");
await new Promise(r => setTimeout(r, 300));
const t0 = Date.now();
const phase = await new Promise((res) => { host.on = s => { if (s.phase === "reveal") res(s.phase); }; host.send(JSON.stringify({ t: "start" })); setTimeout(() => res("timeout"), 25000); });
const dt = Date.now() - t0;
console.log(phase === "reveal" && dt > 14000 ? `ALARM REVEAL PASSED after ${dt} ms` : `FAIL ${phase} ${dt}`); process.exit(phase === "reveal" ? 0 : 1);
