// Guard mode: which key setups may run, and that a move never exceeds the guard's on-chain cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardSetupProblem, clampToGuardCap } from "../src/guard-plan.mjs";

const KEY_A = "0x" + "a1".repeat(32);
const KEY_B = "0x" + "b2".repeat(32);
const GUARD = "0x895fa892dc4ff752ec9114760201f4751c106bf3";

test("without the guard, the wallet's own key is required", () => {
  assert.equal(guardSetupProblem({ useGuard: false, guardAddress: "", guardBotKey: "", privateKey: KEY_A }), null);
  assert.match(guardSetupProblem({ useGuard: false, guardAddress: GUARD, guardBotKey: KEY_B, privateKey: "" }), /PRIVATE_KEY/);
  assert.match(guardSetupProblem({ useGuard: false, guardAddress: "", guardBotKey: "", privateKey: "a1".repeat(32) }), /PRIVATE_KEY/);
});

test("with the guard, the bot key and guard address are enough: the wallet's own key is optional", () => {
  assert.equal(guardSetupProblem({ useGuard: true, guardAddress: GUARD, guardBotKey: KEY_B, privateKey: "" }), null);
  assert.equal(guardSetupProblem({ useGuard: true, guardAddress: GUARD, guardBotKey: KEY_B, privateKey: KEY_A }), null);
});

test("guard mode refuses a missing guard, a missing bot key, or the wallet's key reused as the bot key", () => {
  assert.match(guardSetupProblem({ useGuard: true, guardAddress: "", guardBotKey: KEY_B, privateKey: "" }), /GUARD_ADDRESS/);
  assert.match(guardSetupProblem({ useGuard: true, guardAddress: GUARD, guardBotKey: "", privateKey: KEY_A }), /GUARD_BOT_KEY/);
  assert.match(guardSetupProblem({ useGuard: true, guardAddress: GUARD, guardBotKey: KEY_A, privateKey: KEY_A }), /different key/);
  assert.match(guardSetupProblem({ useGuard: true, guardAddress: GUARD, guardBotKey: KEY_B, privateKey: "not-a-key" }), /malformed/);
});

test("problems never echo a key", () => {
  for (const setup of [
    { useGuard: true, guardAddress: GUARD, guardBotKey: KEY_A, privateKey: KEY_A },
    { useGuard: true, guardAddress: "", guardBotKey: KEY_B, privateKey: KEY_A },
    { useGuard: false, guardAddress: "", guardBotKey: KEY_B, privateKey: "" },
  ]) {
    const msg = guardSetupProblem(setup) ?? "";
    assert.ok(!msg.includes(KEY_A.slice(2)) && !msg.includes(KEY_B.slice(2)), msg);
  }
});

test("a move is clamped to what the guard's daily cap still allows", () => {
  assert.equal(clampToGuardCap(3.83, 25), 3.83);
  assert.equal(clampToGuardCap(3.83, 1.5), 1.5);
  assert.equal(clampToGuardCap(3.83, 0.009), null);
  assert.equal(clampToGuardCap(3.83, 0), null);
});
