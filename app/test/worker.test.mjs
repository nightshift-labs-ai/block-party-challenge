import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/worker.js";
const kv = () => { const m = new Map(); return { get: async (k, t) => m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null, put: async (k, v) => m.set(k, v) }; };
const env = { SCORES: kv() };
const req = (p, o) => new Request("https://x.test" + p, o);
const post = (b, ip = "1.1.1.1") => req("/api/score", { method: "POST", body: JSON.stringify(b), headers: { "cf-connecting-ip": ip } });
test("health", async () => { const r = await handle(req("/health"), env); assert.equal(r.status, 200); assert.equal((await r.json()).kv, "ok"); });
test("score + leaderboard ordering", async () => {
  await handle(post({ board: "t", name: "a", score: 5 }), env);
  const r = await handle(post({ board: "t", name: "b<script>", score: 9 }), env);
  assert.equal((await r.json()).rank, 1);
  const lb = await (await handle(req("/api/leaderboard?board=t"), env)).json();
  assert.deepEqual(lb.entries.map(e => [e.name, e.score]), [["bscript", 9], ["a", 5]]);
});
test("validation", async () => {
  for (const b of [{ board: "../x", score: 1 }, { board: "t", score: -1 }, { board: "t", score: "x" }])
    assert.equal((await handle(post(b, "2.2.2.2"), env)).status, 400);
});
test("rate limit", async () => {
  let last; for (let i = 0; i < 25; i++) last = await handle(post({ board: "r", score: i }, "9.9.9.9"), env);
  assert.equal(last.status, 429);
});
test("health: leaderboard DB failure = degraded (200), strict readiness = 503", async () => {
  const e = { SCORES: kv(), BOARD: { idFromName: () => "x", get: () => ({ fetch: async () => { throw new Error("Exceeded allowed rows read"); } }) } };
  const r = await handle(req("/health"), e); assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.degraded, true); assert.equal(j.db, "error"); assert.equal(j.ok, true);
  const s = await handle(req("/health?ready=1"), e); assert.equal(s.status, 503);
});
test("qualifier: final date + seat signature", async () => {
  const { finalFor } = await import("../src/worker.js");
  assert.equal(finalFor("2026-11-08"), "2026-11-14 20:00 KST"); // Sunday → next Saturday
  assert.equal(finalFor("2026-11-14"), "2026-11-14 20:00 KST"); // Saturday → same day
  const bad = await (await handle(req("/api/seat?s=2026-11-08.1.abcd1234.0000000000000000"), {})).json();
  assert.equal(bad.valid, false);
});
