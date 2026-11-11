// Sponsor report test (copy of uitest with a sponsored episode; saves OUT/report.html). node tools/reporttest.mjs <base> <outdir>
// UI test: host + 2 phones play through; screenshots to OUT dir. node uitest.mjs <base> <outdir>
import { createRequire } from "module"; const require = createRequire(process.env.PW_DIR || process.cwd() + "/");
const { chromium } = require("playwright");
const [base = "http://localhost:8799", out = "/tmp/ext"] = process.argv.slice(2);
const b = await chromium.launch(); const errs = [];
const host = await b.newPage({ viewport: { width: 1280, height: 720 } });
host.on("pageerror", e => errs.push("host " + e.message));
await host.goto(base + "/?practice=1&sponsor=Snack%20Co&title=Dname%20Final%20%231&sq=Best%20snack%20flavour%3F&so=Honey|Spicy|Cheese|Onion&sqk=%EC%B5%9C%EA%B3%A0%EC%9D%98%20%EA%B3%BC%EC%9E%90%20%EB%A7%9B%EC%9D%80%3F&sok=%ED%97%88%EB%8B%88|%EB%A7%A4%EC%9A%B4%EB%A7%9B|%EC%B9%98%EC%A6%88|%EC%96%91%ED%8C%8C"); await host.click("#host"); await host.waitForSelector(".code");
const code = (await host.textContent(".code")).trim();
const phones = [];
for (const n of ["Mina", "Joon"]) {
  const p = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  p.on("pageerror", e => errs.push(n + " " + e.message));
  await p.goto(`${base}/?code=${code}`); await p.fill("#name", n); await p.click("#join"); await p.waitForSelector("text=You're in");
  phones.push(p);
}
await host.waitForSelector("text=Joon"); await host.screenshot({ path: `${out}/1-lobby.png` });
await host.click("#start");
for (let r = 0; r < 7; r++) {
  await host.waitForSelector("#skip");
  await phones[0].screenshot({ path: `${out}/p-round${r + 1}.png` });
  for (const p of phones) {
    if (await p.$("[data-v]")) await p.click("[data-v]");
    else if (await p.$("#gok")) await p.click("#gok");
    else if (await p.$("#tw")) {
      // one clean word + one busted (contains ㄹ) per category, so the reveal shows both
      const W = { food: ["피자", "라면"], animal: ["고양이", "호랑이"], classroom: ["의자", "칠판"], sport: ["축구", "농구"], sky: ["해", "구름"], fruit: ["포도", "딸기"],
        job: ["의사", "경찰"], country: ["한국", "프랑스"], colour: ["파랑", "빨강"], "game item": ["방패", "활"] };
      const q = (await p.textContent("h1")).toLowerCase(), k = Object.keys(W).find(x => q.includes(x)) || "food";
      await p.fill("#tw", W[k][p === phones[0] ? 0 : 1]); await p.click("#tok"); }
    else await p.click(".cell >> nth=12");
  }
  await host.waitForSelector("#next"); await host.waitForTimeout(1300); await host.screenshot({ path: `${out}/2-reveal${r + 1}.png` }); await phones[0].waitForSelector("text=Look at the big screen"); await phones[0].screenshot({ path: `${out}/p-reveal${r + 1}.png` });
  await host.click("#next");
}
await host.waitForSelector("#again"); await host.screenshot({ path: `${out}/3-final.png` }); const rh = await host.evaluate(async () => await (await fetch(document.getElementById("report").href)).text()); (await import("node:fs")).writeFileSync(`${out}/report.html`, rh); console.log("REPORT", rh.length);
console.log("errors:", errs.length ? errs : "none"); console.log("UI TEST PASSED", code);
await b.close();
