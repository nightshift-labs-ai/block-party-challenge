// Block Party Challenge — host screen + phone controller in one page.
import { addRound, resetRecap, makeShort } from "/short.js";
let short = { busy: false, label: "", html: "" };
const $app = document.getElementById("app");
// Creator skin (?creator=dname) + Korean-first text (Korean browsers, ?lang=ko, or the Dname skin; ?lang=en forces English-first).
const QS = new URLSearchParams(location.search);
const CREATOR = QS.get("creator") === "dname";
const KO_FIRST = QS.get("lang") === "ko" || (QS.get("lang") !== "en" && (CREATOR || /^ko\b/i.test(navigator.language || "")));
if (KO_FIRST) document.documentElement.lang = "ko";
const T = (en, ko) => KO_FIRST ? `${ko} <span class="ko">${en}</span>` : `${en} <span class="ko">${ko}</span>`;
const bi = (en, ko) => ko && ko !== en ? (KO_FIRST ? `${esc(ko)} <span class="ko">${esc(en)}</span>` : `${esc(en)} <span class="ko">${esc(ko)}</span>`) : esc(en);
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
let botsStarted = false, brandSent = false, phoneKey = null, lastTick = 0, ws = null, S = null, role = null, code = null, myPick = null, tick = null;

function home() {
  const q = new URLSearchParams(location.search).get("code") || "";
  $app.innerHTML = `
  ${CREATOR ? `<h1>${T("Dname Challenge Arena", "디네임 챌린지 아레나")}</h1><div class="panel"><p>${T("The games from Dname's shorts — now you play them on your phone, against everyone watching.", "디네임 쇼츠 속 게임, 이제 폰으로 직접! 보는 사람 모두와 대결.")}</p><small>${T("Prototype made for Hack the Audience 2026, not an official channel product.", "Hack the Audience 2026 출품 프로토타입이며, 채널 공식 제품이 아닙니다.")}</small></div>` : `<h1>${T("Block Party Challenge", "블록 파티 챌린지")}</h1>`}
  <div class="panel"><p>${T("One big screen, everyone plays on their phone. Read the crowd, don't get greedy, find the diamond.", "큰 화면 하나, 모두 폰으로 참가! 눈치 보고, 욕심 내지 말고, 다이아를 찾아라.")}</p>
  <button class="btn alt" id="host">${T("Host on this screen", "이 화면에서 방 만들기")}</button>
  <button class="btn" id="solo">${T("Try it alone (with 6 bots)", "혼자 체험하기 (봇 6명)")}</button>
  <br><small>${T("Streaming? Add", "방송 중이라면")} <a href="/?overlay=1${CREATOR ? "&creator=dname" : ""}" style="color:var(--gold)">${esc(location.host)}/?overlay=1${CREATOR ? "&amp;creator=dname" : ""}</a> ${T("as a browser source (transparent overlay; Space/Enter drives the show).", "을 브라우저 소스로 추가하세요 (투명 오버레이, Space/Enter로 진행).")}</small></div>
  <div class="panel"><b>${T("Daily challenge", "오늘의 챌린지")}</b> <small>${T("5 rounds, no room needed: play against everyone who played today.", "방 없이 5라운드! 오늘 플레이한 모두와 대결.")}</small><br>
  <button class="btn" id="daily">${T("Play today's challenge", "오늘의 챌린지 하기")}</button></div>
  <div class="panel"><b>${T("Join a room", "방 참가")}</b>
  <input id="code" maxlength="4" placeholder="CODE" value="${esc(q)}" autocapitalize="characters">
  <input id="name" maxlength="12" placeholder="Nickname / 닉네임" value="${esc(localStorage.bpName || "")}">
  <button class="btn" id="join">${T("Join", "참가")}</button><div id="err" style="color:var(--red)"></div></div>
  <div class="panel"><b>${T("This week's season top 10", "이번 주 시즌 TOP 10")}</b><div id="season"><small>…</small></div></div>
  <small><a href="/docs/" style="color:var(--gold)">Docs, pitch &amp; demo video</a> · Made by Nightshift Labs (an AI-agent-run studio) for Hack the Audience 2026. Original game; not affiliated with Mojang or Minecraft.</small>`;
  fetch("/api/leaderboard?board=season").then(r => r.json()).then(j => {
    const el = document.getElementById("season"); if (!el) return;
    el.innerHTML = j.unavailable ? `<small>${T("Leaderboard is taking a short break. Games still work!", "리더보드 잠시 점검 중. 게임은 정상 작동합니다!")}</small>` : j.entries?.length ? `<table>${j.entries.slice(0, 10).map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td style="text-align:right">${e.score}</td></tr>`).join("")}</table>` : `<small>${T("No games yet this week. Be first!", "아직 기록 없음. 첫 번째가 되어 보세요!")}</small>`;
  }).catch(() => {});
  document.getElementById("host").onclick = async () => {
    const r = await fetch("/api/room", { method: "POST" }); const j = await r.json();
    if (!j.code) return alert(j.error || "error");
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    code = j.code; role = "host"; connect(hostQ());
  };
  document.getElementById("daily").onclick = () => daily();
  document.getElementById("solo").onclick = () => { history.replaceState(null, "", "/?practice=1&bots=6"); document.getElementById("host").click(); };
  document.getElementById("join").onclick = () => {
    const c = document.getElementById("code").value.trim().toUpperCase(), n = document.getElementById("name").value.trim();
    if (!/^[A-Z]{4}$/.test(c) || !n) { document.getElementById("err").textContent = "Enter a 4-letter code and a nickname"; return; }
    localStorage.bpName = n; code = c; role = "player";
    const pid = sessionStorage["bp" + c] || "";
    connect(`name=${encodeURIComponent(n)}&pid=${pid}`);
  };
  // s58: RECORDING mode (?overlay=1 as an OBS browser source): create the room right away, so the source shows code + QR with no clicks (once per page load)
  if (OVERLAY && !q && !window.__autoHosted) { window.__autoHosted = 1; document.getElementById("host").click(); }
}

function connect(q) {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room/${code}/ws?${q}`);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === "welcome") sessionStorage["bp" + code] = m.pid;
    else if (m.t === "error") { alert(m.msg); location.reload(); }
    else if (m.t === "state") {
      const prev = S; if (prev?.phase !== m.phase || prev?.round !== m.round) myPick = null; m.skew = Date.now() - m.now; S = m;
      if (role === "host") {
        if (m.phase === "lobby" && prev?.phase !== "lobby") { resetRecap(); short = { busy: false, label: "", html: "" }; }
        if (m.phase === "reveal" && prev?.phase === "question") addRound(m);
      }
      if (role === "host" && actx) {
        if (prev && m.playerCount > prev.playerCount && m.phase === "lobby") sfx.join();
        if (m.phase === "question" && (prev?.phase !== "question" || prev.round !== m.round)) sfx.start();
        if (m.phase === "reveal" && prev?.phase === "question") (m.result && m.result.ok === false ? sfx.bust : sfx.reveal)();
      }
      if (role === "host" && m.phase === "lobby" && !botsStarted) { botsStarted = true; startBots(+new URLSearchParams(location.search).get("bots") || 0); }
      if (role === "host" && m.phase === "lobby" && !brandSent) {
        brandSent = true; const u = new URLSearchParams(location.search);
        const title = u.get("title") || (CREATOR ? "디네임 파이널 · Dname Final" : null);
        if (title || u.get("sponsor") || u.get("prize")) send({ t: "brand", title, sponsor: u.get("sponsor"), prize: u.get("prize") });
      }
      render();
      const b = S.brand;
      if (b && !$app.querySelector(".brand")) $app.insertAdjacentHTML("afterbegin", `<div class="brand">${b.title ? `<b>${esc(b.title)}</b>` : ""}${b.sponsor ? ` · ${T("presented by", "제공")} <b>${esc(b.sponsor)}</b>` : ""}${b.prize ? `<br><small>🎁 ${esc(b.prize)} · ${T("free entry", "무료 참가")}</small>` : ""}</div>`);
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
    : c.kind === "taboo" ? T(`DON'T SAY IT: ${c.q} — without the letter E!`, `금지어 챌린지: ${c.qk} — ㄹ 들어가면 탈락!`)
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
  if (c.kind === "taboo") return `<p class="big">${r.busted} ${T("busted", "탈락")}</p>${role === "host" ? `<small>${T("Off-topic or not OK? Click a word to reject it.", "주제에 안 맞거나 부적절하면 단어를 클릭해 무효 처리.")}</small>` : ""}<div class="players">${(r.words || []).map(x => `<span class="chip ${x.ok ? "done" : "bust"}" ${role === "host" ? `data-w="${esc(x.w)}" title="Click to reject / 클릭하면 무효"` : ""}>${esc(x.w)}${x.n > 1 ? " ×" + x.n : ""}</span>`).join("") || "—"}</div>`;
  if (c.kind === "lava") return grid({ ...c, lavaShown: r.lava }, false, r.count);
  const picks = {}; for (const v of Object.values(r.answers)) picks[v] = (picks[v] || 0) + 1;
  return grid(c, false, picks);
}

function render() {
  const c = S.current, me = S.players.find(p => p.pid === S.you);
  if (role === "host") {
    const join = `${location.origin}/?code=${code}${CREATOR ? "&lang=ko" : ""}`;
    if (S.phase === "lobby") {
      $app.innerHTML = `<h1>${T("Join on your phone", "폰으로 참가하세요")}</h1>
      <div class="panel center"><div>${esc(location.host)}</div><div class="code">${code}</div><small>${esc(join)}</small><br><div class="qr">${qrSvg(join)}</div></div>
      <div class="panel"><b>${S.playerCount} ${T("players", "명")}</b><div class="players">${S.players.slice(0, 30).map(p => `<span class="chip ${p.online ? "" : "off"}">${esc(p.name)}</span>`).join("") || T("Waiting for players…", "참가자 기다리는 중…")}${S.playerCount > 30 ? `<span class="chip">+${S.playerCount - 30}</span>` : ""}</div></div>
      <button class="btn" id="start" ${S.players.length ? "" : "disabled"}>${T("Start episode", "게임 시작")}</button><span class="keys">Space / Enter</span>`;
      document.getElementById("start").onclick = () => send({ t: "start" });
    } else if (S.phase === "question") {
      $app.innerHTML = `<small>Round ${S.round + 1}/${S.rounds} · ${code}</small><h1 class="big">${roundTitle(c)}</h1>${timerBar()}
      <div class="cols"><div>${c.kind === "telepathy" ? `<p class="big">${bi(c.q, c.qk)}</p><div class="opts">${c.opts.map((o, i) => `<div class="opt">${bi(o, c.ok?.[i])}</div>`).join("")}</div>` : c.kind === "diamond" || c.kind === "blockmatch" || c.kind === "lava" ? grid(c, false) : c.kind === "taboo" ? `<p class="big">${T("One word. Korean: no ㄹ (ㄹ, 를, 일, 닭…). English: no E. Unique words score double!", "한 단어! 한글은 ㄹ 금지 (ㄹ, 를, 일, 닭…), 영어는 E 금지. 남과 다른 단어면 2배!")}</p>` : ""}</div><div>
      <div class="panel"><b>${S.answeredCount} / ${S.playerCount} ${T("answered", "제출")}</b>${S.playerCount <= 30 ? `<div class="players">${S.players.map(p => `<span class="chip ${S.answered.includes(p.pid) ? "done" : ""}">${esc(p.name)}</span>`).join("")}</div>` : ""}</div>
      <button class="btn alt" id="skip">${T("Reveal now", "바로 공개")}</button></div></div>`;
      document.getElementById("skip").onclick = () => send({ t: "skip" });
    } else if (S.phase === "reveal") {
      $app.innerHTML = `<small>Round ${S.round + 1}/${S.rounds}</small><h1 class="big">${roundTitle(c)}</h1><div class="cols"><div class="pop">${reveal(c, S.result)}</div>
      <div><div class="panel">${scores(S.players, 5)}</div><button class="btn" id="next">${T("Next", "다음")}</button></div></div>`;
      document.getElementById("next").onclick = () => send({ t: "next" });
      document.querySelectorAll("[data-w]").forEach(el => el.onclick = () => send({ t: "veto", w: el.dataset.w }));
    } else if (S.phase === "final") {
      const w = S.players[0];
      $app.innerHTML = `<h1>🏆 ${esc(w?.name || "")}</h1><div class="panel">${scores(S.players)}</div><button class="btn" id="again">${T("Play again", "다시 하기")}</button> <button class="btn" id="short" ${short.busy || short.html ? "disabled" : ""}>${short.label || `🎬 ${T("Make a Short (9:16)", "쇼츠 만들기")}`}</button><div id="shortout">${short.html}</div>`;
      document.getElementById("again").onclick = () => send({ t: "again" });
      document.getElementById("short").onclick = async () => {
        if (short.busy) return; short.busy = true; render();
        const setLabel = l => { short.label = l; const b = document.getElementById("short"); if (b) b.textContent = l; };
        try {
          const v = await makeShort(S.players, p => setLabel(`🎬 ${Math.round(p * 100)}%`));
          const url = URL.createObjectURL(v.blob);
          short.html = `<p><a class="btn" id="shortdl" download="block-party-short.webm" href="${url}">⬇ ${T("Download Short", "쇼츠 다운로드")} (${Math.round(v.seconds)} s, ${(v.blob.size / 1e6).toFixed(1)} MB)</a></p><small>${T("1080×1920 WebM, no music: add your own track in the editor. Made in this browser, nothing uploaded. Keep this tab visible while it records.", "1080×1920 WebM, 음악 없음 — 편집기에서 음악을 추가하세요. 브라우저에서만 생성되며 업로드되지 않습니다.")}</small>`;
          short.label = "🎬 ✓";
        } catch (err) { short.html = esc(err.message); short.label = ""; }
        short.busy = false; render();
      };
    }
    return;
  }
  // phone
  const head = `<small>${esc(me?.name || "")} · ${me?.score ?? 0} pts · ${code}</small>`;
  if (S.phase !== "question") phoneKey = null;
  if (S.phase === "lobby") $app.innerHTML = `${head}<h1>${T("You're in!", "참가 완료!")}</h1><p>${T("Watch the big screen.", "큰 화면을 보세요.")}</p>`;
  else if (S.phase === "question") {
    const done = S.answered.includes(S.you), key = `${S.round}:${done}`;
    // Don't rebuild the controls on every broadcast (others answering) — it would wipe typing / slider position.
    if (key === phoneKey && document.querySelector(".timer")) return;
    phoneKey = key;
    if (done) { $app.innerHTML = `${head}<h1>${T("Locked in!", "제출 완료!")}</h1>${timerBar()}`; return; }
    let body = "";
    if (c.kind === "telepathy") body = `<p>${bi(c.q, c.qk)}</p><div class="opts">${c.opts.map((o, i) => `<button class="btn opt" data-v="${i}">${bi(o, c.ok?.[i])}</button>`).join("")}</div>`;
    else if (c.kind === "greed") body = `<p class="big center" id="gv">3</p><input type="range" class="slider" min="0" max="${c.maxTake}" value="3" id="gr"><button class="btn alt" id="gok">${T("Take coins", "가져가기")}</button>`;
    else if (c.kind === "taboo") body = `<p>${T("Type one word — Korean without ㄹ, English without E.", "한 단어 입력 — 한글은 ㄹ 없이, 영어는 E 없이.")}</p><input id="tw" maxlength="16" autocomplete="off" placeholder="${esc(c.qk)}"><div id="twarn" style="color:var(--red);min-height:1.2em"></div><button class="btn alt" id="tok">${T("Submit", "제출")}</button>`;
    else body = grid(c, true);
    $app.innerHTML = `${head}<h1 class="big">${roundTitle(c)}</h1>${timerBar()}${body}`;
    document.querySelectorAll("[data-v]").forEach(b => b.onclick = () => send({ t: "answer", v: +b.dataset.v }));
    document.querySelectorAll(".cell").forEach(b => b.onclick = () => { myPick = +b.dataset.i; send({ t: "answer", v: myPick }); });
    const tw = document.getElementById("tw");
    if (tw) {
      tw.focus();
      // Live warning only (the server decides): flags ㄹ inside Hangul syllables or the letter E.
      const bad = w => /e/i.test(w) || [...w].some(ch => { const k = ch.codePointAt(0); if (k >= 0x3139 && k <= 0x3140) return true; if (k < 0xac00 || k > 0xd7a3) return false; const i = k - 0xac00, f = i % 28; return Math.floor(i / 588) === 5 || (f >= 8 && f <= 15); });
      tw.oninput = () => document.getElementById("twarn").textContent = bad(tw.value) ? "⚠️ ㄹ / E!" : "";
      const go = () => { const w = tw.value.trim(); if (w) send({ t: "answer", v: w }); };
      document.getElementById("tok").onclick = go; tw.onkeydown = e => { if (e.key === "Enter") go(); };
    }
    const gr = document.getElementById("gr");
    if (gr) { gr.oninput = () => document.getElementById("gv").textContent = gr.value; document.getElementById("gok").onclick = () => send({ t: "answer", v: +gr.value }); }
  } else if (S.phase === "reveal") {
    const got = S.result?.pts?.[S.you];
    const r = S.result || {};
    const why = got === undefined ? "" : c.kind === "greed" ? (r.ok ? `✅ ${r.total}/${r.pot} — ${T("the room stayed fair!", "모두 욕심을 참았다!")}` : `💥 ${r.total}/${r.pot} — ${T("too greedy!", "욕심 폭발!")}`)
      : c.kind === "lava" ? (got === 0 ? `🔥 ${T("You fell in the lava!", "용암에 빠졌다!")}` : got > 150 ? `🏝️ ${T("Safe and alone: bonus!", "혼자 생존: 보너스!")}` : `🙂 ${T("Safe!", "생존!")}`)
      : c.kind === "taboo" ? (got === 0 ? `🚫 ${T("Busted! The word had a banned letter (or wasn't allowed).", "탈락! 금지 글자가 들어갔어요 (또는 허용되지 않는 단어).")}` : got > 100 ? `✨ ${T("Clean and original: double points!", "통과 + 나만의 단어: 2배!")}` : `🙂 ${T("Clean! Someone else had the same word.", "통과! 같은 단어를 쓴 사람이 있어요.")}`)
      : c.kind === "diamond" ? (got === 500 ? `💎 ${T("You found it!", "다이아 발견!")}` : got ? T("Close!", "아깝다!") : T("Far away…", "멀었다…"))
      : got ? T("You read the crowd!", "눈치 백단!") : T("Nobody agreed with you.", "아무도 같은 답을 안 골랐다.");
    $app.innerHTML = `${head}<h1>${got === undefined ? T("No answer", "미제출") : "+" + got}</h1><p class="big">${why}</p><p>${T("Look at the big screen!", "큰 화면을 보세요!")}</p>`;
  } else {
    $app.innerHTML = `${head}<h1>#${S.rank} / ${S.playerCount}</h1><p>${me?.score ?? 0} pts</p>`;
  }
}

// ---- Demo bots (?bots=N, max 12): extra players run from the host page so one person can try a full episode. Practice rooms only. ----
function startBots(n) {
  n = Math.min(12, Math.max(0, n | 0)); if (!n || new URLSearchParams(location.search).get("practice") !== "1") return;
  const names = ["Bot Ari", "Bot Joon", "Bot Hana", "Bot Seo", "Bot Yuna", "Bot Doha", "Bot Minho", "Bot Taeo", "Bot Jiwoo", "Bot Rin", "Bot Sol", "Bot Ha"];
  // on-topic words per taboo category (most avoid ㄹ; a few deliberately contain it, so bots sometimes bust like real players)
  const TW = { "음식 이름": ["피자", "김밥", "떡볶이", "비빔밥", "치킨", "라면"], "동물 이름": ["고양이", "강아지", "호랑이", "토끼", "사자", "고래"],
    "교실에 있는 물건": ["책상", "의자", "칠판", "공책", "가방", "연필"], "운동 종목": ["축구", "야구", "농구", "수영", "태권도", "골프"],
    "하늘에 있는 것": ["해", "비행기", "무지개", "새", "구름", "별"], "과일 이름": ["사과", "포도", "수박", "바나나", "딸기"],
    "직업 이름": ["의사", "가수", "소방관", "선생님", "경찰"], "나라 이름": ["한국", "중국", "미국", "일본", "캐나다", "프랑스"],
    "색깔 이름": ["하양", "검정", "분홍", "주황", "파랑", "노랑"], "게임 아이템": ["방패", "다이아몬드", "곡괭이", "검", "횃불", "칼"] };
  const words = ["피자", "고양이", "축구", "사과", "파랑", "한국", "의사", "라면", "딸기", "칼", "cat", "dog"];
  for (let i = 0; i < n; i++) setTimeout(() => {
    const b = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room/${code}/ws?name=${encodeURIComponent(names[i])}`);
    b.onmessage = e => { const s = JSON.parse(e.data); if (s.t !== "state" || s.phase !== "question" || s.answered.includes(s.you) || b.k === s.round + ":" + s.deadline) return;
      b.k = s.round + ":" + s.deadline; const c = s.current, r = Math.random();
      const v = c.kind === "telepathy" ? (r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.88 ? 2 : 3) : c.kind === "greed" ? [1, 2, 3, 3, 4][Math.floor(r * 5)] /* ~fair share of the pot (3 per player) so the pot can survive */
        : c.kind === "taboo" ? ((TW[c.qk] || words)[Math.floor(r * (TW[c.qk] || words).length)]) : c.kind === "blockmatch" ? [12, 12, 6, 18, 0][Math.floor(r * 5)] : Math.floor(r * 25);
      setTimeout(() => b.readyState === 1 && b.send(JSON.stringify({ t: "answer", v })), 2000 + r * 6000); };
  }, 300 + i * 250);
}

// ---- Daily Challenge: same 5 rounds for everyone today (Korean date); scores come from today's crowd. ----
async function daily() {
  const tok = localStorage.bpTok || (localStorage.bpTok = [...crypto.getRandomValues(new Uint8Array(12))].map(b => (b % 36).toString(36)).join(""));
  const d = await (await fetch("/api/daily")).json(), key = "bpDaily" + d.date;
  const saved = JSON.parse(localStorage[key] || "[]"); let i = saved.length;
  const MAX = [100, 500, 100, 200, 100];
  const step = () => {
    if (i >= d.rounds.length) return summary();
    const c = d.rounds[i]; myPick = null;
    const body = c.kind === "telepathy" ? `<p class="big">${bi(c.q, c.qk)}</p><div class="opts">${c.opts.map((o, j) => `<button class="btn opt" data-v="${j}">${bi(o, c.ok?.[j])}</button>`).join("")}</div>` : grid(c, true);
    $app.innerHTML = `<small>${T("Daily challenge", "오늘의 챌린지")} ${d.date} · ${i + 1}/5</small><h1 class="big">${roundTitle(c)}</h1>${body}`;
    document.querySelectorAll("[data-v],.cell").forEach(b => b.onclick = async () => {
      const v = +(b.dataset.v ?? b.dataset.i); myPick = c.kind === "telepathy" ? null : v;
      document.querySelectorAll("[data-v],.cell").forEach(x => x.disabled = true);
      const r = await (await fetch("/api/daily/answer", { method: "POST", body: JSON.stringify({ round: i, v, tok }) })).json();
      if (r.error) return alert(r.error);
      saved.push(r.pts); localStorage[key] = JSON.stringify(saved);
      const crowd = c.kind === "telepathy"
        ? `<div class="opts">${c.opts.map((o, j) => `<div class="opt">${bi(o, c.ok?.[j])}<br>${Math.round(100 * (r.counts[j] || 0) / r.total)}%<span class="bar" style="width:${100 * (r.counts[j] || 0) / r.total}%"></span></div>`).join("")}</div>`
        : grid({ ...c, diamond: r.diamond, lavaShown: r.lava }, false, r.counts);
      $app.innerHTML = `<small>${d.date} · ${i + 1}/5 · ${r.total} ${T(r.total === 1 ? "player today" : "players today", "명 참여")}</small><h1>+${r.pts}</h1><div class="pop">${crowd}</div><button class="btn" id="dn">${T("Next", "다음")}</button>`;
      document.getElementById("dn").onclick = () => { i++; step(); };
    });
  };
  const summary = () => {
    const total = saved.reduce((a, b) => a + b, 0), boxes = saved.map((p, j) => p >= MAX[j] * 0.6 ? "🟩" : p > 0 ? "🟨" : "⬛").join("");
    const share = `Block Party Daily ${d.date} ${boxes} ${total}pts ${location.origin}/?daily=1`;
    $app.innerHTML = `<h1>${total} pts</h1><p class="big">${boxes}</p><div class="panel"><small>${esc(share)}</small><br><button class="btn alt" id="sh">${T("Copy result", "결과 복사")}</button></div>
    <p>${T("New challenge every day at midnight (Korea time).", "매일 자정(한국 시간) 새 챌린지!")}</p><button class="btn" id="hm">${T("Home", "처음으로")}</button>`;
    document.getElementById("sh").onclick = () => { navigator.share ? navigator.share({ text: share }).catch(() => {}) : navigator.clipboard?.writeText(share); };
    document.getElementById("hm").onclick = () => { history.replaceState(null, "", "/"); home(); };
  };
  step();
}

if (new URLSearchParams(location.search).get("daily") === "1") daily(); else home();
