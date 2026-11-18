// The read-only wallet lookup: address checks and Morpho's share-to-debt math.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAddress, debtFromShares, isAmount, loanAfter, maxBorrow, pushBorrow, calmRepay } from "../src/wallet-math.mjs";

test("demo push and calm for a connected wallet land on the health they aim for", () => {
  const loan = { collateral: 0.0005, debt: 19.76, price: 64500, oraclePrice: 75000, lltv: 0.86 };
  const push = pushBorrow({ ...loan, pushHealth: 1.06 });
  const pushed = loanAfter({ ...loan, addDebt: push });
  assert.ok(pushed.health >= 1.06 && pushed.health < 1.065, `pushed health ${pushed.health}`);
  assert.ok(pushed.onChainHealth > 1.02, "still allowed by the lending contract");
  assert.equal(pushBorrow({ ...loan, debt: pushed.debt, pushHealth: 1.06 }), 0);          // already at the edge

  const calm = calmRepay({ collateral: 0.0005, debt: pushed.debt, price: 64500, lltv: 0.86, calmHealth: 1.5, spendable: 500 });
  const calmed = loanAfter({ ...loan, debt: pushed.debt - calm });
  assert.ok(calmed.health >= 1.495 && calmed.health < 1.51, `calmed health ${calmed.health}`);
  assert.equal(calmRepay({ collateral: 0.0005, debt: pushed.debt, price: 64500, lltv: 0.86, calmHealth: 1.5, spendable: 2 }), 2);   // only what the wallet has
  assert.equal(calmRepay({ collateral: 0.0005, debt: 10, price: 64500, lltv: 0.86, calmHealth: 1.5, spendable: 500 }), 0);           // already calm
});

test("typed amounts: plain decimals only, within the token's precision, above zero", () => {
  assert.equal(isAmount("0.0005", 8), true);
  assert.equal(isAmount("19.755861", 6), true);
  assert.equal(isAmount("19.7558611", 6), false);      // more decimals than USDC has
  assert.equal(isAmount("0", 6), false);
  assert.equal(isAmount("-1", 6), false);
  assert.equal(isAmount("1e9", 6), false);
  assert.equal(isAmount("1,000", 6), false);
  assert.equal(isAmount(" 5", 6), false);
  assert.equal(isAmount(5, 6), false);
});

test("opening a loan: health at the live price, and the lending contract's own health", () => {
  // the first real loan on this project: 0.0005 cirBTC, 19.755861 USDC, BTC $64,321, oracle $75,000
  const a = loanAfter({ collateral: 0, debt: 0, addCollateral: 0.0005, addDebt: 19.755861, price: 64321.41, oraclePrice: 75000, lltv: 0.86 });
  assert.ok(Math.abs(a.health - 1.4) < 1e-3, `health ${a.health}`);
  assert.ok(Math.abs(a.onChainHealth - 1.632) < 1e-3, `on-chain ${a.onChainHealth}`);
  assert.ok(Math.abs(a.line - 45944) < 1, `line ${a.line}`);
  assert.equal(loanAfter({ collateral: 0.0005, debt: 0, price: 64000, oraclePrice: 75000, lltv: 0.86 }).health, Infinity);
});

test("the most a wallet may borrow keeps health at the floor or better, counting debt it already has", () => {
  const base = { collateral: 0, debt: 0, addCollateral: 0.0005, price: 64000, oraclePrice: 75000, lltv: 0.86, minHealth: 1.25 };
  const max = maxBorrow(base);
  assert.ok(Math.abs(max - (0.0005 * 64000 * 0.86) / 1.25) < 1e-9);
  assert.ok(loanAfter({ ...base, addDebt: max }).health >= 1.25 - 1e-9);
  assert.ok(Math.abs(maxBorrow({ ...base, debt: 10 }) - (max - 10)) < 1e-9);
  assert.equal(maxBorrow({ ...base, debt: 1000 }), 0);
  // when the live price is above the oracle, the lending contract's limit is the one that binds
  const hot = maxBorrow({ ...base, price: 200000, minOnChain: 1.02 });
  assert.ok(Math.abs(hot - (0.0005 * 75000 * 0.86) / 1.02) < 1e-9);
});

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
