// Solo demo test: node tools/solotest.mjs <base> — home → "Try it alone" → 6 bots join → one human phone tab plays round 1 → reveal.
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = process.argv[2]; const b = await chromium.launch(); const errs = [];
const h = await b.newPage({ viewport: { width: 1280, height: 720 } }); h.on("pageerror", e => errs.push(e.message));
await h.goto(base + "/"); await h.click("#solo"); await h.waitForSelector(".code"); const code = (await h.textContent(".code")).trim();
await h.waitForFunction(() => document.querySelectorAll(".chip").length >= 6, null, { timeout: 15000 });
const p = await b.newPage({ viewport: { width: 390, height: 780 }, isMobile: true }); p.on("pageerror", e => errs.push(e.message));
await p.goto(`${base}/?code=${code}`); await p.fill("#name", "Judge"); await p.click("#join"); await p.waitForSelector("text=You're in");
await h.click("#start"); await p.waitForSelector("[data-v]"); await p.click("[data-v] >> nth=0");
await h.waitForSelector("#next", { timeout: 20000 }); await h.screenshot({ path: "/tmp/solo-reveal.png" });
const n = await h.evaluate(() => document.body.innerText.match(/Bot /g)?.length || 0); await b.close();
console.log(!errs.length && n >= 1 ? "SOLO TEST PASSED (bots visible: " + n + ")" : "SOLO TEST FAILED " + errs.join(";") + " bots " + n);
