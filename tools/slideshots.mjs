import { chromium } from "/home/agent/tools/pw/node_modules/playwright/index.mjs";
// usage: node slideshots.mjs <abs html> <outdir>  — one PNG per 720px slide
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto("file://" + process.argv[2]); await p.waitForTimeout(300);
const h = await p.evaluate(() => document.documentElement.scrollHeight);
for (let i = 0; i * 720 < h; i++) { await p.evaluate(y => window.scrollTo(0, y), i * 720); await p.waitForTimeout(100);
  await p.screenshot({ path: `${process.argv[3]}/s${i + 1}.png` }); }
await b.close();
