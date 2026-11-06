// Overlay check: host with ?overlay=1&practice=1, one phone, keyboard-driven start; transparent screenshots.
import { createRequire } from "module"; const require = createRequire("/home/agent/tools/pw/");
const { chromium } = require("playwright");
const [base, out = "/tmp/ext"] = process.argv.slice(2);
const b = await chromium.launch(); const errs = [];
const host = await b.newPage({ viewport: { width: 1280, height: 720 } }); host.on("pageerror", e => errs.push(e.message));
await host.goto(base + "/?overlay=1&practice=1"); await host.click("#host"); await host.waitForSelector(".code");
const code = (await host.textContent(".code")).trim();
const p = await b.newPage({ viewport: { width: 390, height: 780 } });
await p.goto(`${base}/?code=${code}`); await p.fill("#name", "Streamer"); await p.click("#join");
await host.waitForSelector("text=Streamer");
await host.screenshot({ path: `${out}/ov-lobby.png`, omitBackground: true });
await host.keyboard.press("Space"); await host.waitForSelector("#skip");
await host.screenshot({ path: `${out}/ov-question.png`, omitBackground: true });
const bg = await host.evaluate(() => getComputedStyle(document.body).backgroundColor);
console.log("body bg", bg, "errors", errs.length ? errs : "none");
console.log(bg === "rgba(0, 0, 0, 0)" && !errs.length ? "OVERLAY TEST PASSED" : "OVERLAY TEST FAILED");
await b.close();
