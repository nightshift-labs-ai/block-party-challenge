// Record a real episode for the demo video: host screen (1280x720) + one phone (390x780) as WebM, with 9 bot players
// over WebSocket. node tools/recvideo.mjs <base> <outdir>  → host/*.webm, phone/*.webm, marks.json (seconds from host start)
import { chromium } from "/home/agent/tools/pw/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [base, out] = process.argv.slice(2); fs.mkdirSync(out + "/host", { recursive: true }); fs.mkdirSync(out + "/phone", { recursive: true });
const wsBase = base.replace(/^http/, "ws");
const b = await chromium.launch();
const hctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out + "/host", size: { width: 1280, height: 720 } } });
const pctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, recordVideo: { dir: out + "/phone", size: { width: 390, height: 780 } } });
const host = await hctx.newPage(); const t0 = Date.now(); const phone = await pctx.newPage(); const tp = Date.now();
const marks = { phoneOffset: (tp - t0) / 1000, rounds: [] }; const mark = (k) => marks.rounds.push([k, (Date.now() - t0) / 1000]);
const w = ms => new Promise(r => setTimeout(r, ms));
await host.goto(base + "/?practice=1"); await w(1500); await host.click("#host"); await host.waitForSelector(".code");
const code = (await host.textContent(".code")).trim(); mark("lobby");
// Words that fit each category; some contain ㄹ / E on purpose so the reveal shows busts.
const WORDS = { "Name a food": ["김치", "피자", "떡볶이", "라면", "불고기"], "Name an animal": ["고양이", "강아지", "토끼", "호랑이", "곰"],
  "Name something in a classroom": ["의자", "책상", "칠판", "지우개", "연필"], "Name a sport": ["축구", "야구", "농구", "수영", "배구"],
  "Name something in the sky": ["구름", "해", "비행기", "새", "별"], "Name a fruit": ["사과", "포도", "딸기", "바나나", "귤"],
  "Name a job": ["의사", "가수", "요리사", "경찰", "선생님"], "Name a country": ["한국", "일본", "미국", "중국", "프랑스"],
  "Name a colour": ["파랑", "노랑", "빨강", "초록", "검정"], "Name a game item": ["칼", "방패", "곡괭이", "포션", "활"] };
const bots = [];
for (const n of ["Joon", "Hana", "Seo", "Minho", "Yuna", "Doha", "Ari", "Taeo", "Jiwoo"]) {
  await w(500 + Math.random() * 600);
  const ws = new WebSocket(`${wsBase}/api/room/${code}/ws?name=${n}`); bots.push(ws);
  ws.onmessage = e => { const s = JSON.parse(e.data); if (s.t !== "state" || s.phase !== "question" || s.answered.includes(s.you) || ws.k === s.round) return;
    ws.k = s.round; const c = s.current, r = Math.random();
    const v = c.kind === "telepathy" ? (r < 0.5 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : 3) : c.kind === "greed" ? 2 + Math.floor(r * 6)
      : c.kind === "taboo" ? (WORDS[c.q] || ["사과"])[Math.floor(r * 5)] : c.kind === "blockmatch" ? [12, 12, 6, 18, 0][Math.floor(r * 5)] : Math.floor(r * 25);
    setTimeout(() => ws.send(JSON.stringify({ t: "answer", v })), 1500 + Math.random() * 4500); };
}
await phone.goto(`${base}/?code=${code}`); await w(800); await phone.fill("#name", "Mina"); await w(400); await phone.click("#join");
await phone.waitForSelector("text=You're in"); await w(2500);
await host.click("#start");
for (let r = 0; r < 7; r++) {
  await host.waitForSelector("#skip"); mark("q" + r); await w(4200);
  if (await phone.$("[data-v]")) await phone.click("[data-v] >> nth=0");
  else if (await phone.$("#gok")) { await phone.fill("#gr", "4").catch(() => {}); await phone.evaluate(() => { const g = document.getElementById("gr"); g.value = 4; g.oninput(); }); await w(500); await phone.click("#gok"); }
  else if (await phone.$("#tw")) { const q = await host.textContent("h1"); const k = Object.keys(WORDS).find(x => q.includes(x)); await phone.type("#tw", (WORDS[k] || ["사과"])[0], { delay: 250 }); await w(400); await phone.click("#tok"); }
  else await phone.click(".cell >> nth=12");
  await host.waitForSelector("#next", { timeout: 20000 }); mark("r" + r); await w(5500);
  await host.click("#next");
}
await host.waitForSelector("#again"); mark("final"); await w(5000);
for (const ws of bots) ws.close();
await hctx.close(); await pctx.close(); await b.close();
fs.writeFileSync(out + "/marks.json", JSON.stringify(marks)); console.log(JSON.stringify(marks));
