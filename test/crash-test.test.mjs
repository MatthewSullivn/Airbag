// The landing page's crash test draws February 2026's replay as a car and a wall. These checks hold its facts to
// the replay itself (replay/results.json, committed), so the picture can never say something the replay does not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { crashTestFacts } from "../src/crash-test.mjs";

const replay = JSON.parse(readFileSync(new URL("../replay/results.json", import.meta.url), "utf8"));

test("the crash test's facts are the replay's own numbers", () => {
  const f = crashTestFacts(replay);
  assert.ok(f, "the replay tells the story: the loan left alone is sold, the one with Airbag is not");
  const U = replay.headline.untouched;
  assert.equal(f.crash.date, U.liquidation.date, "the wall is the day the loan left alone was sold");
  assert.equal(f.btcKept, U.liquidation.btcKept);
  assert.equal(f.line0, U.line0);
  assert.equal(f.debt0, U.debt0);
  assert.equal(replay.headline.intraday.liquidated, false, "with Airbag the bitcoin is kept");
});

test("the ride runs day by day up to the sale, and Airbag's first move is on it, before the sale", () => {
  const f = crashTestFacts(replay);
  assert.ok(f.days.length >= 6, "at least six days, so the car has a road to drive");
  const dates = replay.chart.map((d) => d.date);
  const start = dates.indexOf(f.days[0].date);
  f.days.forEach((d, i) => {
    assert.equal(d.date, dates[start + i], "consecutive days of the replay, none skipped");
    assert.equal(d.low, replay.chart[start + i].low, "each day's price is that day's low");
  });
  const saved = replay.chart[start + f.saveIndex];
  assert.ok(saved.inLoan > 0, "on the save day some savings are in the loan");
  assert.ok(replay.chart.slice(0, start + f.saveIndex).every((d) => d.inLoan === 0), "and on no day before it");
  assert.ok(f.saveIndex < f.days.length - 1 && f.daysEarly > 0, "Airbag moved before the sale, as the page says");
  assert.equal(f.daysEarly, Math.round((Date.parse(f.crash.date) - Date.parse(saved.date)) / 86_400_000));
});

test("no story, no facts: a replay where nothing was sold, or where Airbag was too late, shows nothing made up", () => {
  const neverSold = structuredClone(replay);
  neverSold.headline.untouched.liquidation = null;
  assert.equal(crashTestFacts(neverSold), null);
  const soldAnyway = structuredClone(replay);
  soldAnyway.headline.intraday.liquidated = true;
  assert.equal(crashTestFacts(soldAnyway), null);
  const tooLate = structuredClone(replay);
  for (const d of tooLate.chart) if (d.date <= replay.headline.untouched.liquidation.date) d.inLoan = 0;
  assert.equal(crashTestFacts(tooLate), null);
  assert.equal(crashTestFacts(null), null);
});
