// Sponsored-episode banner test: node tools/brandtest.mjs <base> → host+phone show exactly one banner (screens in /tmp/brand-*.png)
import { chromium } from "/home/agent/tools/pw/node_modules/playwright/index.mjs";
const base = process.argv[2]; const b = await chromium.launch();
const h = await b.newPage({ viewport: { width: 1280, height: 720 } });
await h.goto(base + "/?practice=1&title=" + encodeURIComponent("Dname Final #1") + "&sponsor=" + encodeURIComponent("Snack Co (demo)") + "&prize=" + encodeURIComponent("Top 3 get a snack box from the sponsor"));
await h.click("#host"); await h.waitForSelector(".code"); const code = (await h.textContent(".code")).trim();
const p = await b.newPage({ viewport: { width: 390, height: 780 }, isMobile: true });
await p.goto(`${base}/?code=${code}`); await p.fill("#name", "Mina"); await p.click("#join"); await p.waitForSelector("text=You're in");
await h.waitForSelector(".brand"); await p.waitForSelector(".brand"); await h.waitForTimeout(500);
await h.screenshot({ path: "/tmp/brand-host.png" }); await p.screenshot({ path: "/tmp/brand-phone.png" });
const n = await p.$$eval(".brand", e => e.length); await b.close();
console.log(n === 1 ? "BRAND TEST PASSED" : "BRAND TEST FAILED " + n);
