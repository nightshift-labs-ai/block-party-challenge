import test from "node:test"; import assert from "node:assert/strict";
import { scoreTelepathy, scoreGreed, scoreDiamond, validAnswer, makeEpisode } from "../src/games.js";
test("telepathy rewards matching", () => {
  const { pts } = scoreTelepathy({ a: 0, b: 0, c: 1 });
  assert.deepEqual(pts, { a: 100, b: 100, c: 0 });
});
test("greed: fits vs bust", () => {
  assert.deepEqual(scoreGreed({ a: 3, b: 4 }, 10).pts, { a: 60, b: 80 });
  const r = scoreGreed({ a: 6, b: 6 }, 10); assert.equal(r.ok, false); assert.deepEqual(r.pts, { a: 0, b: 0 });
});
test("diamond distance", () => {
  assert.deepEqual(scoreDiamond({ a: 12, b: 13, c: 0 }, 12).pts, { a: 500, b: 200, c: 0 });
});
test("validation + episode", () => {
  const ep = makeEpisode(4, () => 0.3);
  assert.equal(ep.length, 5);
  assert.ok(validAnswer(ep[1], 10)); assert.ok(!validAnswer(ep[1], 11)); assert.ok(!validAnswer(ep[0], 1.5));
});
