// UI test: host + 2 phones play through; screenshots to OUT dir. node uitest.mjs <base> <outdir>
import { createRequire } from "module"; const require = createRequire("/home/agent/tools/pw/");
const { chromium } = require("playwright");
const [base = "http://localhost:8799", out = "/tmp/ext"] = process.argv.slice(2);
const b = await chromium.launch(); const errs = [];
const host = await b.newPage({ viewport: { width: 1280, height: 720 } });
host.on("pageerror", e => errs.push("host " + e.message));
await host.goto(base + "/?practice=1"); await host.click("#host"); await host.waitForSelector(".code");
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
    else await p.click(".cell >> nth=12");
  }
  await host.waitForSelector("#next"); await host.screenshot({ path: `${out}/2-reveal${r + 1}.png` });
  await host.click("#next");
}
await host.waitForSelector("#again"); await host.screenshot({ path: `${out}/3-final.png` });
console.log("errors:", errs.length ? errs : "none"); console.log("UI TEST PASSED", code);
await b.close();
