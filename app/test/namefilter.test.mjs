import test from "node:test"; import assert from "node:assert/strict";
import { isUnsafeName, safeName, friendlyName } from "../src/namefilter.js";
test("blocks common tricks", () => {
  for (const n of ["fuck", "F.U.C.K", "fuuuck", "sh1t", "b1tch", "씨발", "시 발", "ㅅㅂ", "병신이", "ass", "N1gga", "개새끼야", "미친"]) assert.equal(isUnsafeName(n), true, n);
});
test("allows normal kid names", () => {
  for (const n of ["Grape", "Cassie", "Bass", "Class", "민준", "서연", "Steve", "Alex", "Diamond12", "canal", "Hannah", "한남동", "Pickaxe"]) assert.equal(isUnsafeName(n), false, n);
});
test("replacement is friendly, stable and short", () => {
  assert.equal(safeName("Steve", "p1"), "Steve");
  const a = safeName("fuck", "pid123"), b = safeName("fuck", "pid123");
  assert.equal(a, b); assert.ok(a.length <= 12 && !isUnsafeName(a), a);
  for (let i = 0; i < 200; i++) assert.ok(friendlyName("s" + i).length <= 12);
});
