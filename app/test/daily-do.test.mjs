// s63: Daily Durable Object logic on node:sqlite (fake state.storage.sql): fair crowd re-scoring + closed-day result.
import test from "node:test"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Daily } from "../src/worker.js";
import { dailyRounds } from "../src/games.js";
function fakeState() {
  const db = new DatabaseSync(":memory:");
  const exec = (q, ...a) => {
    const st = db.prepare(q), rows = st.columns().length ? st.all(...a).map(r => ({ ...r })) : (st.run(...a), []);
    return { toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() };
  };
  let alarm = null;
  return { storage: { sql: { exec }, getAlarm: async () => alarm, setAlarm: async t => { alarm = t; }, deleteAll: async () => {} } };
}
const call = async (d, path, body) => (await d.fetch(new Request("https://do" + path, { method: "POST", body: JSON.stringify(body) }))).json();
test("daily DO: early telepathy players are re-scored against the final crowd", async () => {
  const d = new Daily(fakeState()), R = dailyRounds("2026-11-08");
  const r = i => ({ kind: R[i].kind, diamond: R[i].diamond, lava: R[i].lava });
  const play = async (tok, picks) => { for (let i = 0; i < 5; i++) await call(d, "/", { round: i, v: picks[i], tok, r: r(i) }); };
  // "early" plays first, alone → 100 % crowd match on each crowd round at answer time
  await play("early0001", [0, R[1].diamond, 5, 99, 0].map((v, i) => i === 3 ? [...Array(25).keys()].find(c => !R[3].lava.includes(c)) : v));
  const e1 = await call(d, "/finish", { tok: "early0001", name: "Early" });
  assert.equal(e1.rank, 1);
  const before = e1.total;
  // 9 later players all pick option 1 / cell 6 on the crowd rounds → early's crowd picks are now 10 %
  for (let k = 0; k < 9; k++) { await play("late000" + k + "x", [1, 0, 6, R[3].lava[0], 1]); await call(d, "/finish", { tok: "late000" + k + "x", name: "L" + k }); }
  const res = await call(d, "/result", { tok: "early0001" });
  assert.equal(res.players, 10);
  assert.equal(res.total, before - 3 * 90, "3 crowd rounds drop from 100 to 10 points each");
  const late = await call(d, "/result", { tok: "late0000x" });
  assert.ok(late.total >= 3 * 90, "late players get 90 % crowd points");
  assert.deepEqual(await call(d, "/result", { tok: "nobody000" }), {});
  // repeat finish returns the same entry, with the live total
  const again = await call(d, "/finish", { tok: "early0001", name: "X" });
  assert.equal(again.total, res.total);
});
