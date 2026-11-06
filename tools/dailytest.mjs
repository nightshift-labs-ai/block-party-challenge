// Daily Challenge UI test: node tools/dailytest.mjs <base> <outdir> — plays all 5 rounds on a phone viewport, screenshots, checks result.
import { chromium } from "/home/agent/tools/pw/node_modules/playwright/index.mjs";
const [base, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(base + "/"); await p.click("#daily");
for (let r = 0; r < 5; r++) {
  await p.waitForSelector("[data-v], .cell:not([disabled])"); await p.screenshot({ path: `${out}/d-q${r + 1}.png` });
  if (await p.$("[data-v]")) await p.click("[data-v] >> nth=1"); else await p.click(`.cell >> nth=${(r * 7) % 25}`);
  await p.waitForSelector("#dn"); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/d-r${r + 1}.png` }); await p.click("#dn");
}
await p.waitForSelector("#sh"); await p.screenshot({ path: `${out}/d-final.png` });
const txt = await p.textContent("body"); await b.close();
if (errs.length || !/Block Party Daily \d{4}-\d\d-\d\d [🟩🟨⬛]{5} \d+pts/u.test(txt)) { console.log("DAILY TEST FAILED", errs, txt.slice(0, 300)); process.exit(1); }
console.log("DAILY TEST PASSED");
