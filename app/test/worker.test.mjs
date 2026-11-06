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
