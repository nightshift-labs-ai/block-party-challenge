// Block Party Challenge — host screen + phone controller in one page.
const $app = document.getElementById("app");
const T = (en, ko) => `${en} <span class="ko">${ko}</span>`;
const bi = (en, ko) => ko && ko !== en ? `${esc(en)} <span class="ko">${esc(ko)}</span>` : esc(en);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Streamer overlay: ?overlay=1 → transparent background for an OBS/stream "browser source"; host keys: Space/Enter = start/reveal/next.
const OVERLAY = new URLSearchParams(location.search).get("overlay") === "1";
if (OVERLAY) document.documentElement.classList.add("overlay");
addEventListener("keydown", e => {
  if (role !== "host" || !S || !(e.key === " " || e.key === "Enter")) return;
  e.preventDefault();
  const id = { lobby: "start", question: "skip", reveal: "next", final: "again" }[S.phase];
  document.getElementById(id)?.click();
});
const hostQ = () => "role=host" + (new URLSearchParams(location.search).get("practice") === "1" ? "&practice=1" : "");
// Tiny WebAudio synth (no audio files): ticks, reveal sting, join pop. Host screen only; starts after a user click.
let actx = null;
function beep(freq, dur = 0.08, type = "square", vol = 0.08, when = 0) {
  if (!actx) return;
  const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  join: () => beep(880, 0.06, "square", 0.05),
  tick: () => beep(1200, 0.04, "square", 0.04),
  start: () => [523, 659, 784].forEach((f, i) => beep(f, 0.12, "square", 0.06, i * 0.1)),
  reveal: () => [392, 523, 659, 1047].forEach((f, i) => beep(f, 0.15, "triangle", 0.09, i * 0.08)),
  bust: () => [300, 200, 120].forEach((f, i) => beep(f, 0.2, "sawtooth", 0.07, i * 0.12)),
};
let lastTick = 0, ws = null, S = null, role = null, code = null, myPick = null, tick = null;

function home() {
  const q = new URLSearchParams(location.search).get("code") || "";
  $app.innerHTML = `
  <h1>Block Party Challenge<br><span class="ko">블록 파티 챌린지</span></h1>
  <div class="panel"><p>${T("One big screen, everyone plays on their phone. Read the crowd, don't get greedy, find the diamond.", "큰 화면 하나, 모두 폰으로 참가! 눈치 보고, 욕심 내지 말고, 다이아를 찾아라.")}</p>
  <button class="btn alt" id="host">${T("Host on this screen", "이 화면에서 방 만들기")}</button>
  <br><small>${T("Streaming? Add", "방송 중이라면")} <a href="/?overlay=1" style="color:var(--gold)">${esc(location.host)}/?overlay=1</a> ${T("as a browser source (transparent overlay; Space/Enter drives the show).", "을 브라우저 소스로 추가하세요 (투명 오버레이, Space/Enter로 진행).")}</small></div>
  <div class="panel"><b>${T("Join a room", "방 참가")}</b>
  <input id="code" maxlength="4" placeholder="CODE" value="${esc(q)}" autocapitalize="characters">
  <input id="name" maxlength="12" placeholder="Nickname / 닉네임" value="${esc(localStorage.bpName || "")}">
  <button class="btn" id="join">${T("Join", "참가")}</button><div id="err" style="color:var(--red)"></div></div>
  <div class="panel"><b>${T("This week's season top 10", "이번 주 시즌 TOP 10")}</b><div id="season"><small>…</small></div></div>
  <small>Made by Nightshift Labs (an AI-agent-run studio) for Hack the Audience 2026. Original game; not affiliated with Mojang or Minecraft.</small>`;
  fetch("/api/leaderboard?board=season").then(r => r.json()).then(j => {
    const el = document.getElementById("season"); if (!el) return;
    el.innerHTML = j.entries?.length ? `<table>${j.entries.slice(0, 10).map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td style="text-align:right">${e.score}</td></tr>`).join("")}</table>` : `<small>${T("No games yet this week. Be first!", "아직 기록 없음. 첫 번째가 되어 보세요!")}</small>`;
  }).catch(() => {});
  document.getElementById("host").onclick = async () => {
    const r = await fetch("/api/room", { method: "POST" }); const j = await r.json();
    if (!j.code) return alert(j.error || "error");
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    code = j.code; role = "host"; connect(hostQ());
  };
  document.getElementById("join").onclick = () => {
    const c = document.getElementById("code").value.trim().toUpperCase(), n = document.getElementById("name").value.trim();
    if (!/^[A-Z]{4}$/.test(c) || !n) { document.getElementById("err").textContent = "Enter a 4-letter code and a nickname"; return; }
    localStorage.bpName = n; code = c; role = "player";
    const pid = sessionStorage["bp" + c] || "";
    connect(`name=${encodeURIComponent(n)}&pid=${pid}`);
  };
}

function connect(q) {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room/${code}/ws?${q}`);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === "welcome") sessionStorage["bp" + code] = m.pid;
    else if (m.t === "error") { alert(m.msg); location.reload(); }
    else if (m.t === "state") {
      const prev = S; if (prev?.phase !== m.phase || prev?.round !== m.round) myPick = null; m.skew = Date.now() - m.now; S = m;
      if (role === "host" && actx) {
        if (prev && m.playerCount > prev.playerCount && m.phase === "lobby") sfx.join();
        if (m.phase === "question" && (prev?.phase !== "question" || prev.round !== m.round)) sfx.start();
        if (m.phase === "reveal" && prev?.phase === "question") (m.result && m.result.ok === false ? sfx.bust : sfx.reveal)();
      }
      render();
    }
  };
  ws.onclose = () => setTimeout(() => { if (role) connect(role === "host" ? hostQ() : `name=${encodeURIComponent(localStorage.bpName)}&pid=${sessionStorage["bp" + code] || ""}`); }, 1500);
}
const send = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));

function timerBar() {
  clearInterval(tick);
  if (S.phase !== "question") return "";
  const total = S.current.secs * 1000;
  tick = setInterval(() => { const el = document.querySelector(".timer i"); if (!el) return clearInterval(tick);
    const left = Math.max(0, S.deadline - (Date.now() - S.skew)); el.style.width = (100 * left / total) + "%";
    const sec = Math.ceil(left / 1000); if (role === "host" && sec <= 3 && sec > 0 && sec !== lastTick) { lastTick = sec; sfx.tick(); } }, 250);
  return `<div class="timer"><i style="width:100%"></i></div>`;
}

function roundTitle(c) {
  return c.kind === "telepathy" ? T("TELEPATHY: match the crowd!", "텔레파시: 다수와 같은 답을!")
    : c.kind === "greed" ? T(`GREED: the pot has ${c.pot} coins. Take 0–${c.maxTake}. Too greedy together = nobody gets anything!`, `욕심 게임: 동전 ${c.pot}개. 0–${c.maxTake}개 가져가기. 합이 넘치면 모두 0!`)
    : c.kind === "lava" ? T("LAVA: 8 blocks will turn to lava. Stand on a safe one — alone for a bonus!", "용암: 8칸이 용암으로! 안전한 칸에 서라 (혼자면 보너스)")
    : c.kind === "blockmatch" ? T("BLOCK TELEPATHY: pick the block most people pick!", "블록 텔레파시: 가장 많이 고를 블록은?")
    : T("FIND THE DIAMOND: pick a block", "다이아 찾기: 블록을 골라라");
}

function grid(c, clickable, picks = {}) {
  let h = '<div class="grid">';
  for (let i = 0; i < 25; i++) {
    const isDia = c.diamond === i, n = picks[i] || 0, lava = c.lavaShown?.includes(i);
    h += `<button class="cell ${i < 5 ? "top" : ""} ${isDia ? "dia" : ""} ${lava ? "lava" : ""} ${myPick === i ? "pick" : ""}" data-i="${i}" ${clickable ? "" : "disabled"}>${isDia ? "💎" : n ? n : ""}</button>`;
  }
  return h + "</div>";
}

function qrSvg(text) {
  try { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag(6, 0); } catch { return ""; }
}

function scores(players, limit = 12) {
  return `<table>${players.slice(0, limit).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}${p.pid === S.you ? " ⭐" : ""}</td><td style="text-align:right">${p.score}</td></tr>`).join("")}</table>`;
}

function reveal(c, r) {
  if (c.kind === "telepathy") {
    const tot = Object.values(r.count).reduce((a, b) => a + b, 0) || 1;
    return `<p class="big">${bi(c.q, c.qk)}</p><div class="opts">${c.opts.map((o, i) => `<div class="opt">${bi(o, c.ok?.[i])}<br>${r.count[i] || 0}<span class="bar" style="width:${100 * (r.count[i] || 0) / tot}%"></span></div>`).join("")}</div>`;
  }
  if (c.kind === "greed") return `<p class="big center">${r.total} / ${r.pot} ${r.ok ? "✅ " + T("Everyone keeps their coins!", "모두 획득!") : "💥 " + T("Too greedy! Nobody gets anything.", "욕심 폭발! 모두 0점")}</p>`;
  if (c.kind === "blockmatch") return grid(c, false, r.count);
  if (c.kind === "lava") return grid({ ...c, lavaShown: r.lava }, false, r.count);
  const picks = {}; for (const v of Object.values(r.answers)) picks[v] = (picks[v] || 0) + 1;
  return grid(c, false, picks);
}

function render() {
  const c = S.current, me = S.players.find(p => p.pid === S.you);
  if (role === "host") {
    const join = `${location.origin}/?code=${code}`;
    if (S.phase === "lobby") {
      $app.innerHTML = `<h1>${T("Join on your phone", "폰으로 참가하세요")}</h1>
      <div class="panel center"><div>${esc(location.host)}</div><div class="code">${code}</div><small>${esc(join)}</small><br><div class="qr">${qrSvg(join)}</div></div>
      <div class="panel"><b>${S.playerCount} ${T("players", "명")}</b><div class="players">${S.players.slice(0, 30).map(p => `<span class="chip ${p.online ? "" : "off"}">${esc(p.name)}</span>`).join("") || T("Waiting for players…", "참가자 기다리는 중…")}${S.playerCount > 30 ? `<span class="chip">+${S.playerCount - 30}</span>` : ""}</div></div>
      <button class="btn" id="start" ${S.players.length ? "" : "disabled"}>${T("Start episode", "게임 시작")}</button><span class="keys">Space / Enter</span>`;
      document.getElementById("start").onclick = () => send({ t: "start" });
    } else if (S.phase === "question") {
      $app.innerHTML = `<small>Round ${S.round + 1}/${S.rounds} · ${code}</small><h1 class="big">${roundTitle(c)}</h1>${timerBar()}
      <div class="cols"><div>${c.kind === "telepathy" ? `<p class="big">${bi(c.q, c.qk)}</p><div class="opts">${c.opts.map((o, i) => `<div class="opt">${bi(o, c.ok?.[i])}</div>`).join("")}</div>` : c.kind === "diamond" || c.kind === "blockmatch" || c.kind === "lava" ? grid(c, false) : ""}</div><div>
      <div class="panel"><b>${S.answeredCount} / ${S.playerCount} ${T("answered", "제출")}</b>${S.playerCount <= 30 ? `<div class="players">${S.players.map(p => `<span class="chip ${S.answered.includes(p.pid) ? "done" : ""}">${esc(p.name)}</span>`).join("")}</div>` : ""}</div>
      <button class="btn alt" id="skip">${T("Reveal now", "바로 공개")}</button></div></div>`;
      document.getElementById("skip").onclick = () => send({ t: "skip" });
    } else if (S.phase === "reveal") {
      $app.innerHTML = `<small>Round ${S.round + 1}/${S.rounds}</small><h1 class="big">${roundTitle(c)}</h1><div class="cols"><div>${reveal(c, S.result)}</div>
      <div><div class="panel">${scores(S.players, 5)}</div><button class="btn" id="next">${T("Next", "다음")}</button></div></div>`;
      document.getElementById("next").onclick = () => send({ t: "next" });
    } else if (S.phase === "final") {
      const w = S.players[0];
      $app.innerHTML = `<h1>🏆 ${esc(w?.name || "")}</h1><div class="panel">${scores(S.players)}</div><button class="btn" id="again">${T("Play again", "다시 하기")}</button>`;
      document.getElementById("again").onclick = () => send({ t: "again" });
    }
    return;
  }
  // phone
  const head = `<small>${esc(me?.name || "")} · ${me?.score ?? 0} pts · ${code}</small>`;
  if (S.phase === "lobby") $app.innerHTML = `${head}<h1>${T("You're in!", "참가 완료!")}</h1><p>${T("Watch the big screen.", "큰 화면을 보세요.")}</p>`;
  else if (S.phase === "question") {
    const done = S.answered.includes(S.you);
    if (done) { $app.innerHTML = `${head}<h1>${T("Locked in!", "제출 완료!")}</h1>${timerBar()}`; return; }
    let body = "";
    if (c.kind === "telepathy") body = `<p>${bi(c.q, c.qk)}</p><div class="opts">${c.opts.map((o, i) => `<button class="btn opt" data-v="${i}">${bi(o, c.ok?.[i])}</button>`).join("")}</div>`;
    else if (c.kind === "greed") body = `<p class="big center" id="gv">3</p><input type="range" class="slider" min="0" max="${c.maxTake}" value="3" id="gr"><button class="btn alt" id="gok">${T("Take coins", "가져가기")}</button>`;
    else body = grid(c, true);
    $app.innerHTML = `${head}<h1 class="big">${roundTitle(c)}</h1>${timerBar()}${body}`;
    document.querySelectorAll("[data-v]").forEach(b => b.onclick = () => send({ t: "answer", v: +b.dataset.v }));
    document.querySelectorAll(".cell").forEach(b => b.onclick = () => { myPick = +b.dataset.i; send({ t: "answer", v: myPick }); });
    const gr = document.getElementById("gr");
    if (gr) { gr.oninput = () => document.getElementById("gv").textContent = gr.value; document.getElementById("gok").onclick = () => send({ t: "answer", v: +gr.value }); }
  } else if (S.phase === "reveal") {
    const got = S.result?.pts?.[S.you];
    const r = S.result || {};
    const why = got === undefined ? "" : c.kind === "greed" ? (r.ok ? `✅ ${r.total}/${r.pot} — ${T("the room stayed fair!", "모두 욕심을 참았다!")}` : `💥 ${r.total}/${r.pot} — ${T("too greedy!", "욕심 폭발!")}`)
      : c.kind === "lava" ? (got === 0 ? `🔥 ${T("You fell in the lava!", "용암에 빠졌다!")}` : got > 150 ? `🏝️ ${T("Safe and alone: bonus!", "혼자 생존: 보너스!")}` : `🙂 ${T("Safe!", "생존!")}`)
      : c.kind === "diamond" ? (got === 500 ? `💎 ${T("You found it!", "다이아 발견!")}` : got ? T("Close!", "아깝다!") : T("Far away…", "멀었다…"))
      : got ? T("You read the crowd!", "눈치 백단!") : T("Nobody agreed with you.", "아무도 같은 답을 안 골랐다.");
    $app.innerHTML = `${head}<h1>${got === undefined ? T("No answer", "미제출") : "+" + got}</h1><p class="big">${why}</p><p>${T("Look at the big screen!", "큰 화면을 보세요!")}</p>`;
  } else {
    $app.innerHTML = `${head}<h1>#${S.rank} / ${S.playerCount}</h1><p>${me?.score ?? 0} pts</p>`;
  }
}

home();
