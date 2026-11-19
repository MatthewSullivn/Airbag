// The check of Gemini's settled ladders (src/calibration.mjs): the arithmetic on a few made-up bets whose answer
// can be worked out by hand, then the saved result of the real run (replay/gemini-calibration.json).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { calibration, forecasts, summarize, touchVersusEnd } from "../src/calibration.mjs";

const MIN = 60_000, END = 1_000_000_000_000;
const bet = (strike, yes, trades) => ({ strike, yes, end: END, trades: trades.map(([minutesBefore, p, btc, low]) => ({ t: END - minutesBefore * MIN, p, btc, low })) });

test("a bet's forecast is its last real trade at least ten minutes before the end", () => {
  const bets = [
    bet(100, true, [[90, 0.4, 105, 99], [30, 0.6, 104, 101], [3, 0.95, 104, 103]]),   // the trade 3 minutes before is too late to be a forecast
    bet(110, false, []),                                                              // never traded: no forecast
    bet(120, false, [[5, 0.1, 104, 103]]),                                            // only traded in the last minutes
  ];
  const fs = forecasts(bets);
  assert.equal(fs.length, 1);
  assert.deepEqual({ p: fs[0].p, minutes: fs[0].minutes, yes: fs[0].yes }, { p: 0.6, minutes: 30, yes: true });
});

test("calibration: what the market said against how often it happened", () => {
  // four bets priced at 20%: one came true. Two priced at 80%: both came true.
  const fs = [...[true, false, false, false].map((yes) => ({ p: 0.2, yes })), ...[true, true].map((yes) => ({ p: 0.8, yes }))];
  const c = calibration(fs);
  assert.equal(c.bets, 6);
  const low = c.rows.find((r) => r.from === 0.1), high = c.rows.find((r) => r.from === 0.7);
  assert.deepEqual([low.bets, low.said, low.happened], [4, 0.2, 0.25]);
  assert.equal(high.bets, 2);
  assert.ok(Math.abs(high.said - 0.8) < 1e-12);
  assert.equal(high.happened, 1);
  // Brier: (0.8² + 3 × 0.2² + 2 × 0.2²) / 6
  assert.ok(Math.abs(c.brier - (0.64 + 0.12 + 0.08) / 6) < 1e-12);
  assert.equal(calibration([]).brier, null);
});

test("touching a price against ending below it", () => {
  // strikes below bitcoin's price (100), each given a 25% chance of ending below:
  const fs = [
    { strike: 95, p: 0.75, yes: false, btc: 100, low: 94 },   // ended below (so it touched)
    { strike: 95, p: 0.75, yes: true, btc: 100, low: 94 },    // dipped below on the way, ended above
    { strike: 95, p: 0.75, yes: true, btc: 100, low: 97 },    // never got there
    { strike: 95, p: 0.75, yes: true, btc: 100, low: 96 },    // never got there
    { strike: 105, p: 0.4, yes: false, btc: 100, low: 99 },   // a strike ABOVE the price: not a loan's case, left out
    { strike: 80, p: 0.995, yes: true, btc: 100, low: 99 },   // the market gave it almost no chance: left out
  ];
  const t = touchVersusEnd(fs);
  assert.equal(t.bets, 4);
  assert.deepEqual([t.said, t.ended, t.touched], [0.25, 0.25, 0.5]);
  assert.equal(t.factorSeen, 2, "it touched twice as often as it ended below");
  assert.equal(t.factorVsMarket, 2);
});

test("the saved run of the real check adds up", { skip: !existsSync(new URL("../replay/gemini-calibration.json", import.meta.url)) }, () => {
  const saved = JSON.parse(readFileSync(new URL("../replay/gemini-calibration.json", import.meta.url), "utf8"));
  assert.ok(saved.ladders >= 10 && saved.bets.length >= 100);
  // every bet is a settled "or above" bet, and "yes" means bitcoin ended at or above its strike
  for (const b of saved.bets) assert.equal(b.yes, b.settled >= b.strike, `${b.symbol}: settled ${b.settled}`);
  // the summary in the file is what the saved bets give today
  assert.deepEqual(JSON.parse(JSON.stringify(summarize(saved.bets))), saved.summary);
  // what the write-up says: likelier bets came true more often, and it beat always saying 50%
  const rows = saved.summary.calibration.rows.filter((r) => r.bets >= 10);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].happened >= rows[i - 1].happened, "a higher price came true at least as often");
  assert.ok(saved.summary.calibration.brier < 0.25);
});
