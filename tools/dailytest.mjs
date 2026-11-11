// Daily Challenge UI test: node tools/dailytest.mjs <base> <outdir> — plays all 5 rounds on a phone viewport, screenshots, checks result.
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const [base, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(base + "/"); await p.click("#daily");
for (let r = 0; r < 5; r++) {
  await p.waitForSelector("[data-v], .cell:not([disabled])"); await p.screenshot({ path: `${out}/d-q${r + 1}.png` });
  if (await p.$("[data-v]")) await p.click("[data-v] >> nth=1"); else await p.click(`.cell >> nth=${(r * 7) % 25}`);
  await p.waitForSelector("#dn"); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/d-r${r + 1}.png` }); await p.click("#dn");
}
await p.waitForSelector("#sh"); await p.screenshot({ path: `${out}/d-final.png` }); const txt0 = await p.textContent("body");
// s62 qualifier: enter today's table; on an empty day the first entry ranks within the top 3 → seat link → seat page
await p.fill("#qn", "TestBot"); await p.click("#qb"); await p.waitForSelector("#qr table", { timeout: 10000 });
await p.waitForTimeout(400); await p.screenshot({ path: `${out}/d-qualifier.png` });
const seatEl = await p.$("#seat");
if (seatEl) { await seatEl.click(); await p.waitForSelector("text=/KST/"); await p.screenshot({ path: `${out}/d-seat.png` }); }
const txt = txt0 + (await p.textContent("body")); await b.close();
if (errs.length || !/Block Party Daily \d{4}-\d\d-\d\d [🟩🟨⬛]{5} \d+pts/u.test(txt)) { console.log("DAILY TEST FAILED", errs, txt.slice(0, 300)); process.exit(1); }
console.log("DAILY TEST PASSED");
