// Uptime monitor (Cloudflare cron Worker, free plan): pings TARGET/health every 5 min, keeps 288 samples (24 h) in KV, serves /status (HTML) and /status.json.
const KEEP = 288;
async function probe(env) {
  const t0 = Date.now(); let ok = false, code = 0;
  try { const r = await fetch(env.TARGET + "/health", { cf: { cacheTtl: 0 } }); code = r.status; ok = r.ok; } catch { code = -1; }
  const s = { at: t0, ok, code, ms: Date.now() - t0 };
  const hist = (await env.MON.get("hist", "json")) || [];
  hist.push(s); await env.MON.put("hist", JSON.stringify(hist.slice(-KEEP)));
  return s;
}
function summary(h) {
  const up = h.filter(x => x.ok).length, ms = h.map(x => x.ms).sort((a, b) => a - b);
  return { samples: h.length, uptimePct: h.length ? +(100 * up / h.length).toFixed(2) : null, p50ms: ms[ms.length >> 1] ?? null, p95ms: ms[Math.floor(ms.length * 0.95)] ?? null, last: h[h.length - 1] || null };
}
export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil(probe(env)); },
  async fetch(req, env) {
    const u = new URL(req.url), h = (await env.MON.get("hist", "json")) || [], s = summary(h);
    if (u.pathname === "/status.json") return Response.json({ target: env.TARGET, ...s, history: h.slice(-48) });
    const bars = h.slice(-96).map(x => `<i title="${new Date(x.at).toISOString()} ${x.code} ${x.ms}ms" style="background:${x.ok ? "#2a2" : "#c33"}"></i>`).join("");
    return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Status</title><style>body{font:16px system-ui;max-width:720px;margin:2em auto;padding:0 1em}i{display:inline-block;width:6px;height:28px;margin-right:1px}</style><h1>Service status</h1><p>${s.last?.ok ? "✅ Operational" : "⚠️ Problem detected"} · uptime 24 h: ${s.uptimePct ?? "–"}% · p50 ${s.p50ms ?? "–"} ms · p95 ${s.p95ms ?? "–"} ms</p><div>${bars}</div><p><small>Checked every 5 minutes from Cloudflare's edge. <a href="/status.json">JSON</a></small></p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
