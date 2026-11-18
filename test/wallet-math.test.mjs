// The read-only wallet lookup: address checks and Morpho's share-to-debt math.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAddress, debtFromShares } from "../src/wallet-math.mjs";

test("only real wallet addresses are looked up", () => {
  assert.equal(isAddress("0x3886E94702cA1dB4EdFCee34c20d66Ed79E5aC2e"), true);
  assert.equal(isAddress("0x3886"), false);
  assert.equal(isAddress("3886E94702cA1dB4EdFCee34c20d66Ed79E5aC2e"), false);
  assert.equal(isAddress("0x" + "g".repeat(40)), false);
  assert.equal(isAddress("0x3886E94702cA1dB4EdFCee34c20d66Ed79E5aC2e/../status"), false);
  assert.equal(isAddress(undefined), false);
});

test("no shares means no debt", () => {
  assert.equal(debtFromShares(0n, 745_902_074n, 745_902_074_000_000n), 0n);
});

test("debt follows the market's assets per share and is rounded up", () => {
  // a market where shares = assets * 1e6 exactly: 21.265862 USDC of debt
  const totalAssets = 745_902_074n, totalShares = totalAssets * 1_000_000n;
  assert.equal(debtFromShares(21_265_862n * 1_000_000n, totalAssets, totalShares), 21_265_862n);
  // interest accrued: the same shares are now worth more, never less
  assert.ok(debtFromShares(21_265_862n * 1_000_000n, totalAssets + 1_000n, totalShares) > 21_265_862n);
  // one share of dust still rounds up to the smallest unit
  assert.equal(debtFromShares(1n, totalAssets, totalShares), 1n);
});
