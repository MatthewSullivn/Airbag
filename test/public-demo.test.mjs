// The hosted simulator lets the public press demo buttons (src/public-demo.mjs). These checks make
// sure that can never switch on for the live bot, and that the shared rate limit holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { publicDemoOn, publicAllows, makeRateLimiter } from "../src/public-demo.mjs";

test("public demo only turns on for the simulator with PUBLIC_DEMO=true", () => {
  assert.equal(publicDemoOn("sim", "true"), true);
  assert.equal(publicDemoOn("sim", " TRUE "), true);
  assert.equal(publicDemoOn("sim", ""), false);
  assert.equal(publicDemoOn("sim", undefined), false);
  assert.equal(publicDemoOn("sim", "1"), false);
});

test("public demo can never turn on for the live bot", () => {
  assert.equal(publicDemoOn("live", "true"), false);
  assert.equal(publicDemoOn("live", "TRUE"), false);
});

test("the public can push, reset and set the limit, but not pause the bot", () => {
  for (const a of ["check-key", "push", "reset", "limit"]) assert.equal(publicAllows(a), true, a);
  assert.equal(publicAllows("pause"), false);
  assert.equal(publicAllows("anything-else"), false);
});

test("the shared rate limit allows max hits per window, then frees up", () => {
  const ok = makeRateLimiter(3, 60_000);
  assert.equal(ok(0), true);
  assert.equal(ok(1_000), true);
  assert.equal(ok(2_000), true);
  assert.equal(ok(3_000), false);
  assert.equal(ok(59_999), false);
  assert.equal(ok(60_000), true);   // the first hit has aged out
});
