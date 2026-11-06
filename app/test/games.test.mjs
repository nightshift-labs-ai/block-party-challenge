import test from "node:test"; import assert from "node:assert/strict";
import { scoreLava, pickLava, scoreTelepathy, scoreGreed, scoreDiamond, validAnswer, makeEpisode } from "../src/games.js";
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
  assert.equal(ep.length, 7); assert.equal(ep[5].lava.length, 8); assert.ok(validAnswer(ep[3], 24)); assert.ok(!validAnswer(ep[3], 25));
  assert.ok(validAnswer(ep[1], 10)); assert.ok(!validAnswer(ep[1], 11)); assert.ok(!validAnswer(ep[0], 1.5));
});
import { seasonId } from "../src/room.js";
test("season id = ISO week", () => {
  assert.equal(seasonId(new Date("2026-11-06T10:00:00Z")), "season-2026-w45");
  assert.equal(seasonId(new Date("2027-01-01T10:00:00Z")), "season-2026-w53");
});
test("lava", () => {
  assert.deepEqual(scoreLava({ a: 0, b: 1, c: 1 }, [0, 5]).pts, { a: 0, b: 150, c: 150 });
  assert.deepEqual(scoreLava({ a: 2 }, [0]).pts, { a: 200 });
  const l = pickLava(() => 0.5); assert.equal(new Set(l).size, 8);
});
import { scoreTaboo, hasRieul, normWord, tabooCheck } from "../src/games.js";
test("taboo: ㄹ detection (initial, final, compound final, jamo) and E", () => {
  assert.ok(hasRieul("라면")); assert.ok(hasRieul("딸기")); assert.ok(hasRieul("닭")); assert.ok(hasRieul("ㄹ")); assert.ok(hasRieul("사과를"));
  assert.ok(!hasRieul("사과")); assert.ok(!hasRieul("바나나")); assert.ok(!hasRieul("cat"));
  assert.equal(tabooCheck("apple"), "busted"); assert.equal(tabooCheck("cat"), "ok"); assert.equal(tabooCheck("시발"), "blocked");
});
test("taboo: scoring, uniqueness bonus, public word list hides blocked", () => {
  const r = scoreTaboo({ a: "사과", b: "사과", c: "포도", d: "딸기", e: "씨 발" });
  assert.deepEqual(r.pts, { a: 100, b: 100, c: 200, d: 0, e: 0 });
  assert.equal(r.busted, 2); assert.ok(!r.words.some(x => x.w.includes("발") && x.w.includes("씨")));
  assert.deepEqual(r.words.map(x => x.w), ["사과", "포도", "딸기"]);
});
test("taboo: answer validation", () => {
  assert.equal(normWord("  고  양이 "), "고 양이"); assert.equal(normWord("<b>"), null); assert.equal(normWord(5), null); assert.equal(normWord(""), null);
  const ep = makeEpisode(4, () => 0.3); assert.equal(ep[4].kind, "taboo"); assert.ok(validAnswer(ep[4], "사과")); assert.ok(!validAnswer(ep[4], 3));
});
