// E2E: node test/live-audience-e2e.mjs <base-url> — what a real stream does to a room: a stranger tries to take over as host,
// viewers join late, a phone and the host reconnect, and someone arrives after the final.
const base = process.argv[2] || "http://localhost:8799", wsBase = base.replace(/^http/, "ws");
const { code } = await (await fetch(base + "/api/room", { method: "POST" })).json();
const wait = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const check = (name, ok, got) => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : " → " + JSON.stringify(got))); if (!ok) fails.push(name); };
function open(q) {
  return new Promise((res, rej) => {
    const w = new WebSocket(`${wsBase}/api/room/${code}/ws?${q}`); w.msgs = []; w.closed = null;
    w.onmessage = e => { const m = JSON.parse(e.data); w.msgs.push(m); if (m.t === "state") w.state = m; if (m.t === "welcome") w.pid = m.pid; };
    w.onclose = e => { w.closed = e.code; }; w.onerror = () => rej(new Error("ws error"));
    w.onopen = () => res(w);
  });
}
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(40); } return false; };
const send = (w, m) => w.send(JSON.stringify(m));
const errOf = w => w.msgs.find(m => m.t === "error")?.msg || "";

const host = await open("role=host&hs=secret-a&practice=1");
const players = [await open("name=Ana"), await open("name=Bo"), await open("name=Cy")];
await until(() => players.every(p => p.pid) && host.state?.players?.length === 3);

const thief = await open("role=host");
await until(() => thief.closed !== null);
check("a browser without the host secret cannot take over", thief.closed === 1008 && /host/.test(errOf(thief)), { closed: thief.closed, msgs: thief.msgs });
check("the real host stays connected", host.closed === null, host.closed);

send(host, { t: "start" }); await until(() => host.state?.phase === "question");
const late = await open("name=Late"); await until(() => late.pid, 4000);
check("a late viewer can join during an episode", !!late.pid && !errOf(late), late.msgs);
await until(() => late.state?.phase === "question", 3000);
check("the late viewer sees the running round", late.state?.phase === "question", late.state?.phase);

const pid0 = players[0].pid; players[0].close(); await wait(300);
const again = await open(`name=Ana&pid=${pid0}`); await until(() => again.pid);
check("a dropped phone keeps its identity", again.pid === pid0, again.pid);

host.close(); await wait(300);
const host2 = await open("role=host&hs=secret-a&practice=1"); await until(() => host2.state);
check("the host can reconnect with its secret", host2.closed === null && host2.state?.phase === "question", { closed: host2.closed, phase: host2.state?.phase });

send(host2, { t: "skip" }); await until(() => host2.state?.phase === "reveal");
send(host2, { t: "next" }); await until(() => host2.state?.round === 1 && host2.state?.phase === "question");
check("the greed pot counts late viewers (4 players x 4 = 16)", host2.state?.current?.pot === 16, host2.state?.current);

for (let i = 0; i < 12 && host2.state?.phase !== "final"; i++) {
  if (host2.state.phase === "question") { send(host2, { t: "skip" }); await until(() => host2.state.phase !== "question"); }
  if (host2.state.phase === "reveal") { const r = host2.state.round; send(host2, { t: "next" }); await until(() => host2.state.round !== r || host2.state.phase === "final"); }
}
check("the episode finishes", host2.state?.phase === "final", host2.state?.phase);
const tooLate = await open("name=After"); await until(() => tooLate.closed !== null, 4000);
check("after the final a newcomer gets a readable message", /finished/.test(errOf(tooLate)) && /끝났/.test(errOf(tooLate)), tooLate.msgs);

for (const w of [host2, again, players[1], players[2], late]) try { w.close(); } catch {}
if (fails.length) { console.log("LIVE AUDIENCE E2E FAILED: " + fails.join("; ")); process.exit(1); }
console.log("LIVE AUDIENCE E2E PASSED"); process.exit(0);
