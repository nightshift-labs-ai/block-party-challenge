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
  if (new Date(t0).getUTCMinutes() < 5) await deepCheck(env); // once per hour
  return s;
}
// Synthetic end-to-end check in production (runs hourly): creates a practice room, connects a host + 2 bot phones over
// WebSocket, plays the full 7-round episode and expects the final scoreboard. Failures alert like the health check.
async function ws(url) {
  const r = await fetch(url, { headers: { Upgrade: "websocket" } });
  const w = r.webSocket; if (!w) throw new Error("no websocket (" + r.status + ")");
  w.accept(); return w;
}
export async function deepCheck(env) {
  const t0 = Date.now(), base = env.TARGET, wsb = base.replace(/^http/, "http"); let ok = false, err = "", rounds = 0;
  const socks = [];
  try {
    const { code } = await (await fetch(base + "/api/room", { method: "POST" })).json();
    const url = q => `${wsb}/api/room/${code}/ws?${q}`;
    const host = await ws(url("role=host&practice=1")); socks.push(host);
    for (const [i, n] of ["probeA", "probeB"].entries()) {
      const b = await ws(url(`name=${n}&pid=probe${i}x${t0}`)); socks.push(b);
      b.addEventListener("message", e => { const st = JSON.parse(e.data);
        if (st.t === "state" && st.phase === "question" && !st.answered?.includes(st.you)) {
          const k = st.current.kind; b.send(JSON.stringify({ t: "answer", v: k === "telepathy" ? 0 : k === "greed" ? 2 + i : k === "taboo" ? (i ? "dog" : "사과") : 12 })); } });
    }
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error("timeout after " + rounds + " rounds")), 90000);
      host.addEventListener("message", e => { const st = JSON.parse(e.data);
        if (st.phase === "reveal" && st.round !== host.lastRound) { host.lastRound = st.round; rounds++; setTimeout(() => host.send(JSON.stringify({ t: "next" })), 50); }
        if (st.phase === "final") { clearTimeout(to); res(); } });
      setTimeout(() => host.send(JSON.stringify({ t: "start" })), 300);
    });
    ok = rounds >= 7; if (!ok) err = "only " + rounds + " rounds";
  } catch (e) { err = String(e.message || e); }
  for (const w of socks) try { w.close(1000, "probe done"); } catch {}
  const r = { at: t0, ok, rounds, ms: Date.now() - t0, err };
  const h = (await env.MON.get("deep", "json")) || []; h.push(r); await env.MON.put("deep", JSON.stringify(h.slice(-48)));
  const was = (await env.MON.get("deepAlert")) === "1";
  if (!ok && !was) { await env.MON.put("deepAlert", "1"); await sendAlert(env, "[E2E FAIL] " + env.TARGET, "Hourly synthetic episode failed: " + JSON.stringify(r)); }
  if (ok && was) { await env.MON.put("deepAlert", "0"); await sendAlert(env, "[E2E OK] " + env.TARGET, "Synthetic episode passes again."); }
  return r;
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
    if (env.DEV_TEST === "1" && new URL(req.url).pathname === "/__deep") return Response.json(await deepCheck(env)); // local testing only
    const u = new URL(req.url), h = (await env.MON.get("hist", "json")) || [], s = summary(h);
    if (u.pathname === "/backups.json") {
      const keys = (await env.MON.list({ prefix: "bk:" })).keys.map(k => k.name.slice(3));
      const day = u.searchParams.get("day");
      return Response.json(day ? JSON.parse((await env.MON.get("bk:" + day)) || "null") : { days: keys, keepDays: 14 });
    }
    const deep = (await env.MON.get("deep", "json")) || [];
    if (u.pathname === "/status.json") return Response.json({ target: env.TARGET, ...s, history: h.slice(-48), e2e: deep.slice(-24) });
    const bars = h.slice(-96).map(x => `<i title="${new Date(x.at).toISOString()} ${x.code} ${x.ms}ms" style="background:${x.ok ? "#2a2" : "#c33"}"></i>`).join("");
    return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Status</title><style>body{font:16px system-ui;max-width:720px;margin:2em auto;padding:0 1em}i{display:inline-block;width:6px;height:28px;margin-right:1px}</style><h1>Service status</h1><p>${s.last?.ok ? "✅ Operational" : "⚠️ Problem detected"} · uptime 24 h: ${s.uptimePct ?? "–"}% · p50 ${s.p50ms ?? "–"} ms · p95 ${s.p95ms ?? "–"} ms</p><div>${bars}</div><p>Hourly end-to-end game test (host + 2 bot phones play a full episode): ${deep.length ? deep.slice(-24).map(x => x.ok ? "✅" : "❌").join("") + " · last " + (deep[deep.length - 1].ms / 1000).toFixed(1) + " s" : "no runs yet"}</p><p><small>Checked every 5 minutes from Cloudflare's edge. <a href="/status.json">JSON</a></small></p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
