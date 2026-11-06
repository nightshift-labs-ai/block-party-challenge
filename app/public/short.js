// "Make a Short": turns the episode the host just played into a ~25 s vertical (1080x1920) WebM recap,
// rendered in the browser (canvas + MediaRecorder). Nothing is uploaded; the creator downloads it and adds music.
// Recap data is collected on the host screen only (round headline + the one number that made the moment).

const plain = s => String(s ?? "");
export const recap = { rounds: [], players: 0, title: "" };

export function resetRecap() { recap.rounds = []; recap.players = 0; recap.title = ""; }

// Called on every question → reveal transition (host).
export function addRound(S) {
  const c = S.current, r = S.result || {};
  if (!c || recap.rounds.some(x => x.round === S.round)) return;
  let head = "", hk = "", big = "", sub = "", sk = "";
  const n = Math.max(1, S.playerCount || 1);
  if (c.kind === "telepathy") {
    const cnt = r.count || {}, tot = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;
    let best = 0; for (const k in cnt) if (cnt[k] > (cnt[best] || 0)) best = +k;
    head = "TELEPATHY"; hk = "텔레파시"; sub = plain(c.q); sk = plain(c.qk || "");
    if (cnt[best]) { big = `${Math.round(100 * cnt[best] / tot)}%`; sub += ` → "${plain(c.opts?.[best])}"`; sk += ` → "${plain(c.ok?.[best] || c.opts?.[best])}"`; }
    else { big = "?"; sub += " · Nobody answered in time!"; sk += " · 아무도 못 맞혔다!"; }
  } else if (c.kind === "greed") {
    head = "GREED"; hk = "욕심 게임"; big = `${r.total ?? "?"}/${r.pot ?? c.pot}`;
    sub = r.ok ? "Everyone keeps their coins!" : "TOO GREEDY! Nobody gets anything."; sk = r.ok ? "모두 동전 획득!" : "욕심 폭발! 모두 0점";
  } else if (c.kind === "blockmatch") {
    const v = Object.values(r.count || {}); head = "BLOCK TELEPATHY"; hk = "블록 텔레파시"; big = `${Math.max(0, ...v)}`; sub = "picked the same block"; sk = "명이 같은 블록 선택";
  } else if (c.kind === "taboo") {
    head = "DON'T SAY IT"; hk = "금지어 챌린지"; big = `${r.busted ?? 0}`; sub = `busted on "${plain(c.q)}"`; sk = `명 탈락 · ${plain(c.qk || "")}`;
  } else if (c.kind === "lava") {
    const cnt = r.count || {}; let burned = 0; for (const i of r.lava || []) burned += cnt[i] || 0;
    head = "THE FLOOR IS LAVA"; hk = "바닥은 용암"; big = `${burned}`; sub = burned === 1 ? "player fell in the lava" : "players fell in the lava"; sk = "명 용암에 빠짐";
  } else {
    const picks = {}; for (const v of Object.values(r.answers || {})) picks[v] = (picks[v] || 0) + 1;
    head = "FIND THE DIAMOND"; hk = "다이아 찾기"; big = `${picks[c.diamond] || 0}/${n}`; sub = "found the diamond"; sk = "명 다이아 발견";
  }
  recap.rounds.push({ round: S.round, head, hk, big, sub, sk });
  recap.players = Math.max(recap.players, S.playerCount || 0);
  if (S.brand?.title) recap.title = S.brand.title;
}

// ---- drawing ----
const W = 1080, H = 1920, FPS = 30;
const COLORS = ["#ffd23f", "#3bceac", "#ff6b8b", "#b48cff", "#5ef08f"];
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of plain(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function text(ctx, s, y, size, color = "#fff", weight = 900) {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = "center";
  ctx.lineWidth = size / 7; ctx.strokeStyle = "#0008"; ctx.lineJoin = "round";
  let yy = y;
  for (const l of wrap(ctx, s, W - 140)) { ctx.strokeText(l, W / 2, yy); ctx.fillText(l, W / 2, yy); yy += size * 1.15; }
  return yy;
}
function blocks(ctx, t, hue) {
  // falling voxel-ish squares as a moving background (original art, no game assets)
  ctx.fillStyle = `hsl(${hue},55%,22%)`; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 28; i++) {
    const x = (i * 157) % W, s = 60 + (i * 37) % 90, y = ((i * 263 + t * (120 + (i % 5) * 40)) % (H + 200)) - 200;
    ctx.fillStyle = COLORS[i % COLORS.length] + "55"; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "#0003"; ctx.fillRect(x, y + s * 0.8, s, s * 0.2);
  }
}

export function buildScenes(players) {
  const top = players.slice(0, 3);
  const scenes = [{ dur: 2.5, draw: (ctx, t) => {
    blocks(ctx, t, 260);
    const k = ease(t / 0.6);
    ctx.save(); ctx.translate(W / 2, 700); ctx.scale(k, k); ctx.translate(-W / 2, -700);
    if (recap.title) { const y = text(ctx, recap.title, 600, 110, "#ffd23f"); text(ctx, "BLOCK PARTY CHALLENGE", y + 40, 64); }
    else { text(ctx, "BLOCK", 560, 150, "#ffd23f"); text(ctx, "PARTY", 720, 150, "#3bceac"); text(ctx, "CHALLENGE", 860, 100); }
    ctx.restore();
    text(ctx, `${recap.players || players.length}명 · ${recap.rounds.length}라운드`, 1080, 70, "#fff", 800); text(ctx, `${recap.players || players.length} players · ${recap.rounds.length} rounds`, 1170, 48, "#ddd", 700); text(ctx, "블록 파티 챌린지", 1400, 72, "#ffd23f", 900);
  } }];
  recap.rounds.forEach((r, i) => scenes.push({ dur: 2.6, draw: (ctx, t) => {
    blocks(ctx, t + i * 3, (i * 67) % 360);
    text(ctx, `ROUND ${i + 1} · ${i + 1}라운드`, 300, 52, "#fff", 700);
    const y1 = text(ctx, r.hk || r.head, 450, 110, COLORS[i % COLORS.length]);
    if (r.hk) text(ctx, r.head, y1 - 20, 48, "#fff", 800);
    const k = ease((t - 0.3) / 0.5);
    ctx.save(); ctx.globalAlpha = k; ctx.translate(W / 2, 900); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.translate(-W / 2, -900);
    text(ctx, r.big, 1000, 300, "#fff"); ctx.restore();
    if (t > 0.7) { const y2 = text(ctx, r.sk || r.sub, 1250, 66, "#fff", 900); if (r.sk) text(ctx, r.sub, y2 + 10, 44, "#ddd", 700); }
  } }));
  scenes.push({ dur: 4.5, draw: (ctx, t) => {
    blocks(ctx, t, 45);
    text(ctx, "우승!", 400, 130, "#ffd23f"); text(ctx, "WINNER", 500, 56, "#fff", 800);
    const hs = [520, 380, 300], xs = [W / 2, W / 2 - 330, W / 2 + 330], cs = ["#ffd23f", "#c0c0c0", "#cd7f32"];
    top.forEach((p, i) => {
      const k = ease((t - 0.3 - (2 - i) * 0.35) / 0.5), h = hs[i] * k, x = xs[i] - 140;
      ctx.fillStyle = cs[i]; ctx.fillRect(x, 1500 - h, 280, h); ctx.fillStyle = "#0004"; ctx.fillRect(x, 1500 - h, 280, 24);
      if (k > 0.9) {
        ctx.font = "900 54px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0008"; ctx.lineWidth = 8;
        const nm = plain(p.name).slice(0, 12); ctx.strokeText(nm, xs[i], 1470 - h); ctx.fillText(nm, xs[i], 1470 - h);
        ctx.fillStyle = "#222"; ctx.fillText(String(p.score), xs[i], 1500 - h + 90);
      }
    });
    if (t > 2.2) { text(ctx, "다음 에피소드에 같이 하자!", 1660, 68, "#fff", 900); text(ctx, "Play along next episode!", 1750, 46, "#ddd", 700); }
  } });
  return scenes;
}

// Renders all scenes; real-time recording (MediaRecorder needs wall-clock frames).
export async function makeShort(players, onProgress = () => {}) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), scenes = buildScenes(players);
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  const frameAt = sec => { let acc = 0; for (const s of scenes) { if (sec < acc + s.dur) return s.draw(ctx, sec - acc); acc += s.dur; } scenes.at(-1).draw(ctx, scenes.at(-1).dur); };
  frameAt(0);
  if (!window.MediaRecorder || !cv.captureStream) throw new Error("This browser cannot record video (use Chrome/Edge).");
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "";
  const rec = new MediaRecorder(cv.captureStream(FPS), mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {});
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(res => rec.onstop = res);
  rec.start(500);
  const t0 = performance.now();
  await new Promise(res => {
    const step = () => {
      const sec = (performance.now() - t0) / 1000;
      frameAt(Math.min(sec, total)); onProgress(Math.min(1, sec / total));
      if (sec >= total + 0.2) return res();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop(); await done;
  return { blob: new Blob(chunks, { type: "video/webm" }), seconds: total, canvas: cv };
}
