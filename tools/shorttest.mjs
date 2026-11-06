// "Make a Short" test: node tools/shorttest.mjs <base> <out.webm> — solo room with 6 bots, host skips through every round,
// then clicks "Make a Short" on the final screen and saves the recorded 9:16 WebM.
import { chromium } from "/home/agent/tools/pw/node_modules/playwright/index.mjs";
import { writeFileSync } from "fs";
const [base, out = "/tmp/short.webm"] = process.argv.slice(2); const b = await chromium.launch(); const errs = [];
const h = await b.newPage({ viewport: { width: 1280, height: 720 } }); h.on("pageerror", e => errs.push(e.message));
await h.goto(base + "/"); await h.click("#solo"); await h.waitForSelector(".code");
await h.waitForFunction(() => document.querySelectorAll(".chip").length >= 6, null, { timeout: 15000 });
await h.click("#start");
for (let i = 0; i < 60; i++) {
  if (await h.$("#again")) break;
  const btn = await h.$("#next") || await h.$("#skip");
  if (btn) await btn.click().catch(() => {});
  await h.waitForTimeout(700);
}
await h.waitForSelector("#short", { timeout: 10000 });
const rounds = await h.evaluate(async () => (await import("/short.js")).recap.rounds);
await h.click("#short");
await h.waitForSelector("#shortdl", { timeout: 90000 });
await h.screenshot({ path: out.replace(/\.webm$/, "-final.png") });
const b64 = await h.evaluate(async () => { const r = await fetch(document.getElementById("shortdl").href); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (const x of a) s += String.fromCharCode(x); return btoa(s); });
writeFileSync(out, Buffer.from(b64, "base64")); await b.close();
const ok = !errs.length && rounds.length >= 3 && b64.length > 100000;
console.log(ok ? `SHORT TEST PASSED rounds=${rounds.length} bytes=${Math.round(b64.length * 0.75)}` : `SHORT TEST FAILED errs=${errs.join(";")} rounds=${rounds.length} b64=${b64.length}`);
console.log(JSON.stringify(rounds));
