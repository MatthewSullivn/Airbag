// The landing page opens with February 2026's replay told on a chart: bitcoin's daily candles, the line below which
// the bitcoin is sold, and Airbag moving that line. These checks hold the story's facts to the replay itself
// (replay/results.json, committed), so the page can never say something the replay does not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { INTRO_SECONDS, STORY_END, airbagOpen, candleSoFar, crashStory, frameOf, introAt, sceneAt, storyKeys } from "../src/crash-test.mjs";

const replay = JSON.parse(readFileSync(new URL("../replay/results.json", import.meta.url), "utf8"));

test("the story's facts are the replay's own numbers", () => {
  const s = crashStory(replay);
  assert.ok(s, "the replay tells the story: the loan left alone is sold, the one with Airbag is not");
  const U = replay.headline.untouched;
  assert.equal(s.days[s.crashIndex].date, U.liquidation.date, "the crash day is the day the loan left alone was sold");
  assert.equal(s.btcKept, U.liquidation.btcKept);
  assert.equal(s.line0, U.line0);
  assert.equal(s.debt0, U.debt0);
  assert.equal(s.savings, replay.headline.intraday.savings);
  assert.equal(replay.headline.intraday.liquidated, false, "with Airbag the bitcoin is kept");
});

test("the days run one after another, each with the replay's candle, line and savings", () => {
  const s = crashStory(replay);
  const dates = replay.chart.map((d) => d.date);
  const start = dates.indexOf(s.days[0].date);
  assert.ok(start >= 0);
  s.days.forEach((d, i) => {
    const row = replay.chart[start + i];
    assert.equal(d.date, row.date, "consecutive days of the replay, none skipped");
    assert.deepEqual([d.open, d.high, d.low, d.close], [row.open, row.high, row.low, row.close], "the day's candle is the replay's");
    assert.ok(d.low <= Math.min(d.open, d.close) && d.high >= Math.max(d.open, d.close), "a real candle: low under the body, high over it");
    assert.equal(d.line, row.airbagLine);
    assert.equal(d.inLoan, row.inLoan);
  });
  assert.ok(s.crashIndex >= 9, "enough calm days before the crash to show the fall");
  assert.ok(s.days.length - 1 - s.crashIndex >= 3, "and some days after it, to show bitcoin coming back");
});

test("Airbag moves first, and the story the page tells holds on every day", () => {
  const s = crashStory(replay);
  const saved = s.days[s.saveIndex], crash = s.days[s.crashIndex];
  assert.ok(saved.inLoan > 0 && s.days.slice(0, s.saveIndex).every((d) => d.inLoan === 0 && d.line === s.line0), "nothing moves before the save day");
  assert.ok(s.saveIndex < s.crashIndex && s.daysEarly > 0, "Airbag moved before the sale, as the page says");
  assert.equal(s.daysEarly, Math.round((Date.parse(crash.date) - Date.parse(saved.date)) / 86_400_000));
  // without Airbag: no day before the crash touches the line, and the crash day does
  assert.ok(s.days.slice(0, s.crashIndex).every((d) => d.low > s.line0), "left alone, the loan survives until the crash day");
  assert.ok(crash.low <= s.line0, "on the crash day bitcoin touches the line");
  // with Airbag: the price never reaches the line. The page glides the line from one day's level to the next
  // while the day's candle forms, so both levels must stay under the day's low.
  s.days.forEach((d, i) => {
    const before = i > s.saveIndex ? s.days[i - 1].line : s.line0;
    if (i >= s.saveIndex) assert.ok(Math.max(before, d.line) < d.low, `${d.date}: the line stays under bitcoin's low, wherever between the two levels it is drawn`);
  });
  assert.ok(saved.line < s.line0 && crash.line < crash.low, "the save lowers the line, and on the crash day bitcoin stays above it");
});

test("a day while it is still happening: open, then the high, then the low, then the close", () => {
  const day = { open: 62776, high: 71666, low: 60000, close: 70526 };
  assert.deepEqual(candleSoFar(day, 0), { open: 62776, high: 62776, low: 62776, close: 62776 });
  assert.deepEqual(candleSoFar(day, 1 / 3), { open: 62776, high: 71666, low: 62776, close: 71666 });
  const falling = candleSoFar(day, 0.5);
  assert.ok(falling.close < day.high && falling.close > day.low && falling.high === day.high);
  assert.equal(candleSoFar(day, 2 / 3).low, 60000);
  assert.deepEqual(candleSoFar(day, 1), day);
  // never outside the finished candle, and the low only ever goes down
  let low = Infinity;
  for (let f = 0; f <= 1.0001; f += 0.01) {
    const c = candleSoFar(day, f);
    assert.ok(c.low >= day.low && c.high <= day.high && c.close >= c.low && c.close <= c.high);
    assert.ok(c.low <= low + 1e-9);
    low = c.low;
  }
});

// The page tells the story as the visitor scrolls. Walk it from the top to the end in small steps, the way a slow
// scroll would, and look at what the chart shows at every one of them.
function walk(visit) {
  const story = crashStory(replay), K = storyKeys(story);
  for (let i = 0; i <= STORY_END * 1000; i++) {
    const at = i / 1000, scene = sceneAt(at, K);
    visit({ at, scene, story, K, frame: frameOf(story, scene, airbagOpen(scene, K) ? 1 : 0) });
  }
}

test("walking the story: the chart moves smoothly, and Airbag comes on only where nothing changes on screen", () => {
  let before = null;
  walk(({ at, scene, story, K }) => {
    assert.ok(scene.n >= K.calm - 1e-9 && scene.n <= K.N + 1e-9, `at ${at} the chart shows between the calm and every candle`);
    if (before) {
      assert.ok(Math.abs(scene.n - before.scene.n) < 0.06, `at ${at} the chart does not jump`);
      if (scene.airbag !== before.scene.airbag) {
        // the switch between the two runs: the same candles on both sides, no airbag open, nothing sold
        for (const side of [before.scene, scene]) {
          const f = frameOf(story, side, airbagOpen(side, K) ? 1 : 0);
          assert.ok(!f.cushion && !f.sold && f.level === story.line0, `at ${at} the run changes on a chart that looks the same either way`);
        }
      }
    }
    before = { scene };
  });
});

test("walking the story: without Airbag the bitcoin is sold exactly when bitcoin touches the line", () => {
  let soldAt = null;
  walk(({ at, scene, story, frame }) => {
    if (scene.airbag) return;
    assert.equal(frame.level, story.line0, "left alone, the line never moves");
    const touched = story.days.some((d, i) => (i < frame.full ? d.low <= story.line0 : i === frame.full && frame.forming && frame.candle.low <= story.line0));
    assert.equal(frame.sold, touched, `at ${at}: sold if and only if a candle on the chart reaches the line`);
    if (!frame.sold) assert.ok(frame.price > story.line0, `at ${at}: until then bitcoin is above the line`);
    else if (soldAt == null) soldAt = at;
  });
  assert.ok(soldAt > 3 && soldAt < 4, "the sale happens in the part of the story that says so");
});

test("walking the story: with Airbag bitcoin never reaches the line, and it lands on the day of the crash", () => {
  let opened = null, landedAt = null;
  walk(({ at, scene, story, K, frame }) => {
    if (!scene.airbag) return;
    assert.equal(frame.sold, false);
    assert.ok(frame.level <= story.line0, "Airbag only ever moves the line down");
    assert.ok(frame.candle.low > frame.level && frame.price > frame.level, `at ${at}: bitcoin stays above the line`);
    // and while the airbag is still springing open, drawn a little past its place
    assert.ok(frame.candle.low > frameOf(story, scene, 1.08).level, `at ${at}: also with the airbag drawn at its fullest`);
    if (frame.cushion && opened == null && at >= 1) opened = at;
    if (frame.landed && landedAt == null && at >= 1) landedAt = at;
    if (frame.landed) assert.ok(frame.cushion && frame.full >= K.crash, "bitcoin lands on an open airbag, on the crash day or after");
    assert.ok(frame.inLoan >= 0 && frame.inLoan <= story.savings + 1e-9, "the airbag is never more than the savings");
  });
  assert.ok(opened > 5 && opened < 6, "the airbag opens in the part of the story that says so");
  assert.ok(landedAt > 6 && landedAt < 7, "and bitcoin lands on it in the part that says so");
});

test("the story begins and ends on the whole picture, and plays its ending by itself when the page opens", () => {
  const story = crashStory(replay), K = storyKeys(story);
  for (const at of [0, STORY_END]) {
    const scene = sceneAt(at, K), frame = frameOf(story, scene, 1);
    assert.deepEqual(scene, { n: K.N, airbag: true });
    assert.ok(frame.cushion && frame.landed && !frame.sold);
    assert.equal(frame.level, story.days[K.N - 1].line);
    assert.equal(frame.price, story.days[K.N - 1].close);
  }
  // the ending, by itself: from the calm to every candle, never backwards, past the save and the crash
  assert.equal(introAt(0, K), K.calm);
  assert.equal(introAt(INTRO_SECONDS, K), K.N);
  let n = introAt(0, K);
  for (let t = 0; t <= INTRO_SECONDS; t += 0.01) {
    const next = introAt(t, K);
    assert.ok(next >= n - 1e-9 && next - n < 0.25, "it only moves forward, a little at a time");
    n = next;
  }
  // the first frame it shows is the first frame of the story's first caption, apart from Airbag being on
  assert.equal(sceneAt(1, K).n, K.calm);
});

test("no story, no facts: a replay where nothing was sold, or where Airbag was too late, shows nothing made up", () => {
  const neverSold = structuredClone(replay);
  neverSold.headline.untouched.liquidation = null;
  assert.equal(crashStory(neverSold), null);
  const soldAnyway = structuredClone(replay);
  soldAnyway.headline.intraday.liquidated = true;
  assert.equal(crashStory(soldAnyway), null);
  const tooLate = structuredClone(replay);
  for (const d of tooLate.chart) if (d.date <= replay.headline.untouched.liquidation.date) d.inLoan = 0;
  assert.equal(crashStory(tooLate), null);
  assert.equal(crashStory(null), null);
});
