// Extra checks for the brain, on real Gemini ladders saved on Nov 17 2026.   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ladderFromEvent, chanceBelow, fitTail, chanceBelowEst, oddsLoanDiesEst, makeOddsModel,
  highestSafeLine, decide, health, liqPrice, normCdf, normInv, RULE,
} from "../src/brain.mjs";

const load = (t) => JSON.parse(readFileSync(new URL(`./fixtures/${t}.json`, import.meta.url), "utf8"));
const NOV30 = ladderFromEvent(load("BTC2611302200"));
const NOV20 = ladderFromEvent(load("BTC2611202200"));
const SPOT = 64058;                 // Gemini BTC/USD last price when the fixtures were saved
const COL = 0.0001;                 // one faucet drip of cirBTC
const debtAt = (h, price = SPOT, col = COL) => (col * price * 0.86) / h;

test("live ladder: structured strikes, sorted, tidy", () => {
  assert.equal(NOV30.length, 12);
  assert.deepEqual(NOV30.map((p) => p.strike), [57500, 60000, 62500, 65000, 67500, 70000, 72500, 75000, 77500, 80000, 82500, 85000]);
  for (let i = 1; i < NOV30.length; i++) assert.ok(NOV30[i].pAbove <= NOV30[i - 1].pAbove);
  assert.ok(Math.abs(NOV30[0].pAbove - 0.89) < 1e-9);  // (0.87 + 0.91) / 2
  assert.equal(NOV20.length, 21);
});

test("label fallback still works without the strike field", () => {
  const L = ladderFromEvent({ contracts: [
    { label: "$62,000 or above", prices: { bestBid: "0.7", bestAsk: "0.8" } },
    { label: "$61,000 or above", prices: { bestBid: "0.8", bestAsk: "0.9" } },
    { label: "no number here", prices: { bestBid: "0.5", bestAsk: "0.5" } },
    { label: "$63,000 or above", prices: {} },
  ] });
  assert.deepEqual(L.map((p) => p.strike), [61000, 62000]);
});

test("normal CDF and its inverse agree", () => {
  for (const p of [0.001, 0.02, 0.16, 0.5, 0.84, 0.98, 0.999]) assert.ok(Math.abs(normCdf(normInv(p)) - p) < 1e-6);
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-9);
});

test("tail fit gives a sensible log-normal for the Nov 30 ladder", () => {
  const t = fitTail(NOV30);
  assert.ok(t.median > 60000 && t.median < 68000, `median ${t.median}`);
  assert.ok(t.sigma > 0.03 && t.sigma < 0.2, `sigma ${t.sigma}`);
  assert.equal(fitTail([{ strike: 60000, pAbove: 0.5 }]), null);   // one point cannot be fitted
});

test("estimated odds: quoted inside the ladder, continuous and falling below it", () => {
  const t = fitTail(NOV30);
  const inside = chanceBelowEst(NOV30, 61000, t);
  assert.equal(inside.source, "quoted");
  assert.ok(Math.abs(inside.p - chanceBelow(NOV30, 61000)) < 1e-12);
  const at = chanceBelowEst(NOV30, 57500, t).p;
  const justBelow = chanceBelowEst(NOV30, 57499, t);
  assert.equal(justBelow.source, "estimated");
  assert.ok(Math.abs(justBelow.p - at) < 0.002, "continuous at the lowest bet");
  let prev = at;
  for (let k = 57000; k >= 30000; k -= 1000) {
    const p = chanceBelowEst(NOV30, k, t).p;
    assert.ok(p <= prev + 1e-12 && p >= 0, `falls as the line falls (${k})`);
    prev = p;
  }
  assert.ok(chanceBelowEst(NOV30, 40000, t).p < 0.001);
  assert.equal(chanceBelowEst([], 50000), null);
});

test("worse of two ladders wins", () => {
  const m = makeOddsModel([{ ticker: "NOV30", ladder: NOV30 }, { ticker: "NOV20", ladder: NOV20 }]);
  for (const line of [50000, 55000, 58000, 61000, 63000]) {
    const a = oddsLoanDiesEst(NOV30, line)?.odds ?? 0;
    const b = oddsLoanDiesEst(NOV20, line)?.odds ?? 0;
    assert.ok(Math.abs(m.oddsAt(line) - Math.max(a, b)) < 1e-12, `line ${line}`);
  }
  assert.equal(makeOddsModel([]).oddsAt(50000), null);
});

test("highestSafeLine finds the edge of the limit", () => {
  const { oddsAt } = makeOddsModel([{ ticker: "NOV30", ladder: NOV30 }]);
  const line = highestSafeLine(oddsAt, 0.05, SPOT);
  assert.ok(oddsAt(line) <= 0.05);
  assert.ok(oddsAt(line + 50) > 0.05 - 0.005, "close to the edge");
});

test("demo cycle on live odds: push -> repay -> calm -> reset -> give back, and no ping-pong", () => {
  const { oddsAt } = makeOddsModel([{ ticker: "NOV30", ladder: NOV30 }, { ticker: "NOV20", ladder: NOV20 }]);
  const limit = 0.05;
  const run = (debt, savings, inLoan) => decide({ debt, collateral: COL, btcPrice: SPOT }, null, savings, inLoan, limit, { oddsAt });

  // calm start at health 1.40: nothing to do
  assert.equal(run(debtAt(1.4), 10, 0).action, "nothing");

  // "push it to the edge": Borrow Kit's max borrow lands at about health 1.056 on the real price
  const pushed = debtAt(1.056);
  const d1 = run(pushed, 10, 0);
  assert.equal(d1.action, "repay");
  assert.ok(d1.odds > 0.4, `odds after push ${d1.odds}`);
  const afterRepay = pushed - d1.repay;
  const h1 = health(afterRepay, COL, SPOT);
  assert.ok(h1 >= RULE.repayToHealth - 1e-9, `health after repay ${h1}`);
  assert.ok(oddsAt(liqPrice(afterRepay, COL)) <= limit);

  // right after the save: nothing (no ping-pong)
  assert.equal(run(afterRepay, 10 - d1.repay, d1.repay).action, "nothing");

  // reset (demo button repays from the wallet to health 1.5): the bot gives savings back...
  const d2 = run(debtAt(1.5), 10 - d1.repay, d1.repay);
  assert.equal(d2.action, "give_back");
  const afterBack = debtAt(1.5) + d2.borrow;
  assert.ok(health(afterBack, COL, SPOT) >= RULE.giveBackFloor - 1e-9);
  assert.ok(oddsAt(liqPrice(afterBack, COL)) <= limit / 2 + 1e-9);
  // ...and then sits still
  assert.equal(run(afterBack, 10 - d1.repay + d2.borrow, d1.repay - d2.borrow).action, "nothing");
});

test("odds trigger fires before the health rule does", () => {
  const { oddsAt } = makeOddsModel([{ ticker: "NOV30", ladder: NOV30 }]);
  const d = decide({ debt: debtAt(1.15), collateral: COL, btcPrice: SPOT }, null, 10, 0, 0.05, { oddsAt });
  assert.ok(d.health > RULE.actBelowHealth);
  assert.equal(d.action, "repay");
});

test("Gemini down: falls back to the health rule only", () => {
  const none = () => null;
  assert.equal(decide({ debt: debtAt(1.15), collateral: COL, btcPrice: SPOT }, null, 10, 0, 0.05, { oddsAt: none }).action, "nothing");
  const d = decide({ debt: debtAt(1.05), collateral: COL, btcPrice: SPOT }, null, 10, 0, 0.05, { oddsAt: none });
  assert.equal(d.action, "repay");
  assert.ok(Math.abs(d.targetLine - SPOT / RULE.repayToHealth) < 1e-6);
});

test("out of savings is reported, and repay never exceeds savings", () => {
  const { oddsAt } = makeOddsModel([{ ticker: "NOV30", ladder: NOV30 }]);
  assert.equal(decide({ debt: debtAt(1.05), collateral: COL, btcPrice: SPOT }, null, 0, 0, 0.05, { oddsAt }).action, "out_of_savings");
  const d = decide({ debt: debtAt(1.05), collateral: COL, btcPrice: SPOT }, null, 0.1, 0, 0.05, { oddsAt });
  assert.equal(d.action, "repay");
  assert.equal(d.repay, 0.1);
});

test("custom lltv is respected", () => {
  assert.ok(Math.abs(liqPrice(5, 0.0001, 0.8) - 5 / (0.0001 * 0.8)) < 1e-9);
  assert.ok(Math.abs(health(5, 0.0001, 60000, 0.8) - (0.0001 * 60000 * 0.8) / 5) < 1e-12);
});
