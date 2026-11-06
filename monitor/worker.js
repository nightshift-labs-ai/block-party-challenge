// Uptime monitor (Cloudflare cron Worker, free plan): pings TARGET/health every 5 min, keeps 288 samples (24 h) in KV, serves /status (HTML), /status.json and /backups.json; emails an alert after 2 failed checks.
const KEEP = 288;
async function probe(env) {
  const t0 = Date.now(); let ok = false, code = 0;
  try { const r = await fetch(env.TARGET + "/health", { cf: { cacheTtl: 0 } }); code = r.status; ok = r.ok; } catch { code = -1; }
  const s = { at: t0, ok, code, ms: Date.now() - t0 };
  const hist = (await env.MON.get("hist", "json")) || [];
  hist.push(s); await env.MON.put("hist", JSON.stringify(hist.slice(-KEEP)));
  await alertIfNeeded(env, hist);
  await backupDaily(env);
  return s;
}
// Alerting: 2 failed checks in a row (10 min) → one email; first good check afterwards → "recovered" email.
// Sent with AgentMail (secret AGENTMAIL_API_KEY, vars ALERT_FROM/ALERT_TO). No secret → alerts are only logged.
async function sendAlert(env, subject, text) {
  console.log("ALERT", subject);
  if (!env.AGENTMAIL_API_KEY || !env.ALERT_FROM || !env.ALERT_TO) return;
  try {
    await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(env.ALERT_FROM)}/messages/send`, {
      method: "POST", headers: { authorization: "Bearer " + env.AGENTMAIL_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ to: env.ALERT_TO, subject, text }) });
  } catch (e) { console.log("alert send failed", String(e)); }
}
async function alertIfNeeded(env, hist) {
  const last2 = hist.slice(-2), down = last2.length === 2 && last2.every(x => !x.ok);
  const was = (await env.MON.get("alerting")) === "1";
  if (down && !was) {
    await env.MON.put("alerting", "1");
    await sendAlert(env, "[DOWN] " + env.TARGET, `Health check failed twice in a row.\nLast: ${JSON.stringify(last2)}\nRunbook: docs/OPS.md → Incidents.`);
  } else if (was && hist[hist.length - 1]?.ok) {
    await env.MON.put("alerting", "0");
    await sendAlert(env, "[RECOVERED] " + env.TARGET, `Health check OK again at ${new Date().toISOString()}.`);
  }
}
// Daily backup of the season leaderboard (the only long-lived user data). Kept 14 days in KV; served at /backups.json.
async function backupDaily(env) {
  const day = new Date().toISOString().slice(0, 10);
  if (await env.MON.get("bk:" + day)) return;
  try {
    const r = await fetch(env.TARGET + "/api/leaderboard?board=season", { cf: { cacheTtl: 0 } });
    if (!r.ok) return;
    await env.MON.put("bk:" + day, JSON.stringify({ at: Date.now(), data: await r.json() }), { expirationTtl: 14 * 86400 });
  } catch {}
}
function summary(h) {
  const up = h.filter(x => x.ok).length, ms = h.map(x => x.ms).sort((a, b) => a - b);
  return { samples: h.length, uptimePct: h.length ? +(100 * up / h.length).toFixed(2) : null, p50ms: ms[ms.length >> 1] ?? null, p95ms: ms[Math.floor(ms.length * 0.95)] ?? null, last: h[h.length - 1] || null };
}
export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil(probe(env)); },
  async fetch(req, env) {
    const u = new URL(req.url), h = (await env.MON.get("hist", "json")) || [], s = summary(h);
    if (u.pathname === "/backups.json") {
      const keys = (await env.MON.list({ prefix: "bk:" })).keys.map(k => k.name.slice(3));
      const day = u.searchParams.get("day");
      return Response.json(day ? JSON.parse((await env.MON.get("bk:" + day)) || "null") : { days: keys, keepDays: 14 });
    }
    if (u.pathname === "/status.json") return Response.json({ target: env.TARGET, ...s, history: h.slice(-48) });
    const bars = h.slice(-96).map(x => `<i title="${new Date(x.at).toISOString()} ${x.code} ${x.ms}ms" style="background:${x.ok ? "#2a2" : "#c33"}"></i>`).join("");
    return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Status</title><style>body{font:16px system-ui;max-width:720px;margin:2em auto;padding:0 1em}i{display:inline-block;width:6px;height:28px;margin-right:1px}</style><h1>Service status</h1><p>${s.last?.ok ? "✅ Operational" : "⚠️ Problem detected"} · uptime 24 h: ${s.uptimePct ?? "–"}% · p50 ${s.p50ms ?? "–"} ms · p95 ${s.p95ms ?? "–"} ms</p><div>${bars}</div><p><small>Checked every 5 minutes from Cloudflare's edge. <a href="/status.json">JSON</a></small></p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
