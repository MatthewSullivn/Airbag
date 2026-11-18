// The market-over-time chart on the Market screen, checked on real hourly candles saved from Gemini on
// Nov 18, 2026 ("$65,000 or above on Nov 30", GET /v2/candles/GEMI-BTC2611302200-HI65000/1hr).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { activity, pointsFromCandles, worthDrawing } from "../src/market-history.mjs";

const raw = JSON.parse(readFileSync(new URL("./fixtures/candles-BTC2611302200-HI65000-1hr.json", import.meta.url), "utf8"));

test("Gemini's candles become hourly points, oldest first, every price a chance between 0 and 1", () => {
  const pts = pointsFromCandles(raw);
  assert.equal(pts.length, raw.length);
  for (let i = 1; i < pts.length; i++) assert.equal(pts[i][0] - pts[i - 1][0], 3_600_000, "one point an hour, no gaps");
  for (const [, p, v] of pts) {
    assert.ok(p >= 0 && p <= 1);
    assert.ok(v >= 0);
  }
  // the saved week: the market's chance of ending above $65,000 fell from 86% to about 50%
  assert.equal(pts[0][1], 0.86);
  assert.equal(pts[pts.length - 1][1], 0.5);
});

test("the price only changes in an hour that had a trade", () => {
  const pts = pointsFromCandles(raw);
  for (let i = 1; i < pts.length; i++) if (pts[i][2] === 0) assert.equal(pts[i][1], pts[i - 1][1], "no trade, same price as the hour before");
});

test("junk rows are dropped instead of drawn", () => {
  assert.deepEqual(pointsFromCandles(null), []);
  assert.deepEqual(pointsFromCandles({ result: "error" }), []);
  assert.deepEqual(pointsFromCandles([[1, 0, 0, 0, 1.4, 2], ["x", 0, 0, 0, 0.5, 1], null, [2000, 0.4, 0.4, 0.4, 0.4, -3], [1000, 0.6, 0.6, 0.6, 0.6, 5]]), [[1000, 0.6, 5], [2000, 0.4, 0]]);
});

test("activity counts the hours that traded and the range the price covered", () => {
  const a = activity(pointsFromCandles(raw));
  assert.equal(a.hours, 16);
  assert.equal(a.low, 0.45);
  assert.equal(a.high, 0.86);
  assert.deepEqual(activity([]), { hours: 0, volume: 0, low: null, high: null });
});

test("the bets nearest the price come first, and a bet with a single trade is left out", () => {
  const pts = pointsFromCandles(raw);
  const flat = [[0, 0.84, 1], [3_600_000, 0.84, 0]];                    // traded once: a flat line
  const twice = [[0, 0.7, 1], [3_600_000, 0.6, 2]];
  const series = [
    { strike: 60_000, symbol: "A", points: flat },
    { strike: 85_000, symbol: "B", points: pts },
    { strike: 65_000, symbol: "C", points: twice },
    { strike: 62_500, symbol: "D", points: twice },
    { strike: 70_000, symbol: "E", points: twice },
  ];
  // bitcoin at $64,000: $65,000 is nearest, then $62,500, then $70,000. The far, busy $85,000 bet comes last.
  assert.deepEqual(worthDrawing(series, 64_000).map((s) => s.symbol), ["C", "D", "E", "B"]);
  assert.deepEqual(worthDrawing(series, 64_000, { max: 2 }).map((s) => s.symbol), ["C", "D"]);
  // no price to go by: the busiest first
  assert.equal(worthDrawing(series, null)[0].symbol, "B");
  assert.equal(worthDrawing([{ strike: 1, symbol: "A", points: flat }], 1).length, 0);
  assert.equal(worthDrawing(null, null).length, 0);
});
