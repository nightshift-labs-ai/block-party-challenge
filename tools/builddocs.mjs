// Publish the submission docs on the demo site: app/public/docs/*.html (from Markdown via marked) + pitch.pdf + demo.mp4 + index.
// node tools/builddocs.mjs  (run from projects/extriver before deploy)
import { marked } from "/home/agent/tools/pw/node_modules/marked/lib/marked.esm.js";
import fs from "node:fs";
const out = "app/public/docs"; fs.mkdirSync(out, { recursive: true });
const css = `body{font:16px/1.55 system-ui,"Noto Sans KR",sans-serif;max-width:900px;margin:2em auto;padding:0 1em;background:#14161f;color:#e8e8ee}a{color:#f2c94c}
table{border-collapse:collapse;margin:1em 0;font-size:14px}td,th{border:1px solid #333a4d;padding:6px 8px;vertical-align:top}th{background:#262b3b}code{background:#262b3b;padding:1px 4px}h1,h2,h3{color:#f2c94c}`;
const docs = [["README.md", "overview", "Overview, how it plays, tech & unit cost"], ["RESEARCH.md", "research", "Audience research: 5 creators, why Dname, trends"],
  ["docs/BUSINESS.md", "business", "Business model, 3-scenario year-1 model, competitors"], ["docs/OPS.md", "ops", "Operations: deploy, rollback, monitoring, load test"], ["docs/SUMMARY-KO.md", "summary-ko", "한국어 요약 (Korean one-page summary)"]];
for (const [src, name, title] of docs) {
  const md = fs.readFileSync(src, "utf8").replace(/\]\(docs\//g, "](").replace(/\]\(RESEARCH\.md\)/g, "](research.html)").replace(/\]\(BUSINESS\.md\)/g, "](business.html)");
  fs.writeFileSync(`${out}/${name}.html`, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>${css}</style><p><a href="./">← all docs</a></p>${marked.parse(md)}`);
}
fs.copyFileSync("docs/pitch.pdf", `${out}/pitch.pdf`); fs.copyFileSync("docs/demo.mp4", `${out}/demo.mp4`); fs.copyFileSync("docs/demo.srt", `${out}/demo.srt`);
fs.writeFileSync(`${out}/index.html`, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Block Party Challenge: docs</title><style>${css}</style>
<h1>Block Party Challenge: submission docs</h1><p>Hack the Audience 2026 · creator partner GodDot / Dname · <a href="/">play the prototype</a> · <a href="https://github.com/nightshift-labs-ai/block-party-challenge">source code (GitHub, MIT)</a> (alone: "Try it alone (with 6 bots)")</p>
<ul>${docs.map(([, n, t]) => `<li><a href="${n}.html">${t}</a></li>`).join("")}<li><a href="pitch.pdf">Pitch deck (PDF, 10 slides)</a></li><li><a href="demo.mp4">Demo video (2:40, MP4)</a></li>
<li><a href="https://extriver-monitor.nightshift-labs.workers.dev/status">Live status page</a></li></ul>
<p><small>Built by Nightshift Labs, an AI-agent-run studio. Original game; not affiliated with Mojang or Minecraft.</small></p>`);
console.log("docs built:", fs.readdirSync(out).join(" "));
