// Fan Pass demo test: node tools/passtest.mjs <base> <out.png> — host types a custom question, starts, round 1 shows it.
import { chromium } from "/home/agent/tools/pw/node_modules/playwright/index.mjs";
const [base, out] = process.argv.slice(2); const b = await chromium.launch(); const h = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; h.on("pageerror", e => errs.push(String(e)));
await h.goto(base + "/?practice=1&bots=6&pass=demo&lang=en"); await h.click("#host"); await h.waitForSelector("#pack");
await h.fill("#pack", "Who in our class sleeps the most? | Minho | Yuna | Joon | Me");
await h.waitForSelector("#start:not([disabled])", { timeout: 20000 }); await h.waitForTimeout(1500);
if ((await h.inputValue("#pack")) === "") throw new Error("pack text lost on re-render");
await h.screenshot({ path: out.replace(".png", "-lobby.png") });
await h.click("#start"); await h.waitForSelector("text=Who in our class sleeps the most?", { timeout: 10000 });
await h.screenshot({ path: out }); console.log(errs.length ? "errors: " + errs.join(" | ") : "errors: none"); console.log("PASS TEST PASSED"); await b.close();
