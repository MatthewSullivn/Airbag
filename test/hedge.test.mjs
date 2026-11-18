// The hedge quote on the Market screen, checked on the real Gemini ladders saved on Nov 17, 2026.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { betsFromEvent, hedgeQuote, selloffFactor } from "../src/hedge.mjs";

const event = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

test("a sell-off on the Arc market takes a 4.4% penalty (Morpho's rule at LLTV 0.86)", () => {
  assert.ok(Math.abs(selloffFactor(0.86) - 1.04384) < 1e-4);
  assert.equal(selloffFactor(0.2), 1.15, "capped at 15%");
});

test("every bet of a saved ladder comes with a price for No, lowest price first", () => {
  const bets = betsFromEvent(event("BTC2611302200"));
  assert.ok(bets.length >= 5);
  for (let i = 1; i < bets.length; i++) assert.ok(bets[i].strike > bets[i - 1].strike);
  for (const b of bets) {
    assert.ok(b.buyNo == null || (b.buyNo >= 0 && b.buyNo <= 1));
    // a Yes and a No on the same bet cost a little over a dollar together (the spread), never much less
    if (b.buyNo != null && b.buyYes != null) assert.ok(b.buyNo + b.buyYes >= 0.99, `Yes + No on ${b.strike} is ${b.buyNo + b.buyYes}`);
  }
  // a No gets dearer as the price it bets against gets higher
  const priced = bets.filter((b) => b.buyNo != null);
  for (let i = 1; i < priced.length; i++) assert.ok(priced[i].buyNo >= priced[i - 1].buyNo - 0.05);
});

test("the quote uses the lowest bet at or above the loan's line", () => {
  const bets = betsFromEvent(event("BTC2611302200"));
  const lowest = bets.find((b) => b.buyNo != null && b.buyNo > 0 && b.buyNo < 1);
  const below = hedgeQuote({ bets, line: 51_000, debt: 22.29, lltv: 0.86 });      // a healthy loan: its line is under every bet
  assert.equal(below.strike, lowest.strike);
  assert.equal(below.price, lowest.buyNo);
  const inside = hedgeQuote({ bets, line: 61_000, debt: 22.29, lltv: 0.86 });     // a pushed loan: its line is inside the ladder
  assert.ok(inside.strike >= 61_000);
  assert.ok(bets.every((b) => b.strike < 61_000 || b.strike >= inside.strike || b.buyNo == null || b.buyNo <= 0 || b.buyNo >= 1));
});

test("the numbers add up: loss is the penalty on the debt, cost is that loss times the price of a No", () => {
  const bets = [{ strike: 57_500, buyYes: 0.93, buyNo: 0.11, symbol: "X" }];
  const q = hedgeQuote({ bets, line: 51_347, debt: 22.29, lltv: 0.86 });
  assert.ok(Math.abs(q.penaltyShare - 0.04384) < 1e-4);
  assert.ok(Math.abs(q.loss - 0.977) < 0.002);
  assert.ok(Math.abs(q.cost - q.loss * 0.11) < 1e-12);
});

test("no quote without a usable bet, a line or a debt", () => {
  const bets = [{ strike: 57_500, buyYes: 0.93, buyNo: 0.11, symbol: null }];
  assert.equal(hedgeQuote({ bets, line: 60_000, debt: 10, lltv: 0.86 }), null, "the loan's line is above every bet");
  assert.equal(hedgeQuote({ bets: [{ strike: 57_500, buyYes: null, buyNo: null, symbol: null }], line: 50_000, debt: 10, lltv: 0.86 }), null);
  assert.equal(hedgeQuote({ bets, line: 0, debt: 10, lltv: 0.86 }), null);
  assert.equal(hedgeQuote({ bets, line: 50_000, debt: 0, lltv: 0.86 }), null);
  assert.equal(hedgeQuote({ bets: null, line: 50_000, debt: 10, lltv: 0.86 }), null);
});
