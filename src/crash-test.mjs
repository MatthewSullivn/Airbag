// Pure logic for the landing page's crash story: what February 2026's replay (replay/results.json) says, as the
// handful of facts the page's chart is drawn from. Shared by the page (web/src/components/crash-story.tsx, through
// the @crash alias) and the tests, so every number the story shows comes straight from the replay.

/**
 * The replay as a story told on a chart: the days around the crash, each with bitcoin's daily candle and the price
 * below which the loan with Airbag would be sold that day, and the moments the story turns on. Null when the replay
 * does not tell the story (the loan left alone was never sold, the loan with Airbag was sold too, or Airbag first
 * acted after the sale).
 * @param {any} replay replay/results.json, as GET /api/replay serves it
 */
export function crashStory(replay) {
  const untouched = replay?.headline?.untouched;
  const withAirbag = replay?.headline?.intraday;
  const liq = untouched?.liquidation;
  const chart = replay?.chart;
  if (!liq || !withAirbag || withAirbag.liquidated || !Array.isArray(chart)) return null;
  const crashAt = chart.findIndex((d) => d.date === liq.date);
  const savedAt = chart.findIndex((d) => d.inLoan > 0);
  if (crashAt < 1 || savedAt < 0 || savedAt >= crashAt) return null;
  // two weeks before the sale (the calm, then the fall) and eight days after it (bitcoin comes back)
  const from = Math.max(0, crashAt - 13);
  const to = Math.min(chart.length - 1, crashAt + 8);
  const days = chart.slice(from, to + 1).map((d) => ({
    date: d.date,
    open: d.open ?? d.close,
    high: d.high ?? Math.max(d.close, d.low),
    low: d.low,
    close: d.close,
    line: d.airbagLine,
    inLoan: d.inLoan,
  }));
  return {
    days,
    saveIndex: savedAt - from,
    crashIndex: crashAt - from,
    line0: untouched.line0,
    debt0: untouched.debt0,
    savings: withAirbag.savings,
    btcKept: liq.btcKept,
    daysEarly: Math.round((Date.parse(liq.date) - Date.parse(chart[savedAt].date)) / 86_400_000),
  };
}

/**
 * A day while it is still happening, walked the way the replay walks it (open, then the high, then the low, then
 * the close): the candle so far at fraction f (0 to 1) of the day. Its `close` is the price at that moment.
 * @param {{ open: number, high: number, low: number, close: number }} day
 * @param {number} f
 */
export function candleSoFar(day, f) {
  const t = Math.min(1, Math.max(0, f)) * 3;
  if (t <= 1) {
    const price = day.open + (day.high - day.open) * t;
    return { open: day.open, high: price, low: day.open, close: price };
  }
  if (t <= 2) {
    const price = day.high + (day.low - day.high) * (t - 1);
    return { open: day.open, high: day.high, low: Math.min(day.open, price), close: price };
  }
  return { open: day.open, high: day.high, low: day.low, close: day.low + (day.close - day.low) * (t - 2) };
}

// ------------------------------------------------------------------ the story, moment by moment
// The page plays the story on its chart in three steps, the same three for both runs (without Airbag, and with it):
//   1  bitcoin falls for a week, to the evening before the crash (with Airbag: the airbag opens on the way)
//   2  the day of the crash (without: the candle touches the line and the bitcoin is sold; with: it lands on the airbag)
//   3  the days after it, as bitcoin comes back
// A position u runs from 0 (the calm before the fall) to 3. These functions say what the chart shows at each
// position, and where a play by itself is after t seconds. They are here, not in the page, so the tests can walk
// both runs and check that the picture never says something the replay does not.

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (x, a, b) => clamp((x - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);

/** The airbag opens this far into the day the odds pass the limit. */
export const OPEN_AT = 0.4;
/** The story's steps: position 1, 2 and 3 are where each one ends. */
export const STEPS = 3;

/**
 * The days the story turns on, as counts of candles: all of them, the calm before the fall, the day Airbag first
 * moves, the day of the crash.
 * @param {{ days: unknown[], saveIndex: number, crashIndex: number }} story
 */
export function storyKeys(story) {
  return { N: story.days.length, calm: Math.max(1, story.crashIndex - 8), save: story.saveIndex, crash: story.crashIndex };
}

/**
 * How many candles are on the chart at position u (the last one may be half made). The same in both runs: the
 * candles are bitcoin's, whatever the loan does.
 * @param {number} u 0 to 3
 * @param {{ N: number, calm: number, crash: number }} keys
 */
export function candlesAt(u, { N, calm, crash }) {
  const x = clamp(u, 0, STEPS);
  if (x <= 1) return lerp(calm, crash, x);
  if (x <= 2) return lerp(crash, crash + 1, x - 1);
  return lerp(crash + 1, N, x - 2);
}

/** Which step the story is in at position u: 1, 2 or 3. */
export function stepAt(u) {
  return Math.min(STEPS, Math.max(1, Math.ceil(u - 1e-9)));
}

// A play by itself: each step takes its time, then the chart holds still so the step can be read.
const PLAY = [
  { until: 0.7, from: 0, to: 0 },      // the calm, for a moment
  { until: 5.3, from: 0, to: 1 },      // the week of falling
  { until: 7.1, from: 1, to: 1 },
  { until: 9.7, from: 1, to: 2 },      // the day of the crash, slowly
  { until: 11.5, from: 2, to: 2 },
  { until: 13.5, from: 2, to: 3, ease: true },   // the days after
];
/** How long the story takes to play by itself, in seconds. */
export const PLAY_SECONDS = PLAY[PLAY.length - 1].until;
/**
 * Where the story is t seconds into a play: a position from 0 to 3.
 * @param {number} t
 */
export function playAt(t) {
  let since = 0;
  for (const part of PLAY) {
    if (t < part.until) {
      const k = seg(t, since, part.until);
      return lerp(part.from, part.to, part.ease ? 1 - (1 - k) ** 3 : k);
    }
    since = part.until;
  }
  return STEPS;
}

/** Whether the airbag is open in this scene. */
export function airbagOpen(scene, { save }) {
  const full = Math.floor(scene.n + 1e-6);
  return scene.airbag && (full > save || (full === save && scene.n - full >= OPEN_AT));
}

/**
 * Everything the chart and its read-outs show in one scene. `pop` is how far open the airbag is drawn (0 shut, 1 open,
 * a little over 1 as it springs open): the line sits that share of the way from its old level to its new one.
 * @param {NonNullable<ReturnType<typeof crashStory>>} story
 * @param {{ n: number, airbag: boolean }} scene
 * @param {number} pop
 */
export function frameOf(story, scene, pop) {
  const { days, saveIndex: save, crashIndex: crash, line0 } = story;
  const N = days.length;
  const full = Math.min(N, Math.floor(scene.n + 1e-6));
  const f = full >= N ? 0 : scene.n - full;
  const forming = f > 0.015;
  const cur = forming ? full : Math.max(0, full - 1);   // the day on screen now
  const candle = forming ? candleSoFar(days[full], f) : days[cur];
  // the line glides from yesterday's level to today's while the price falls, in the middle of the day
  const glide = smooth(seg(f, 0.3, 0.72));
  const today = (i, from, to) => (i === full && forming ? (i === save ? (f >= OPEN_AT ? to : from) : lerp(from, to, glide)) : to);
  const levelAt = (i) => {
    if (!scene.airbag || i < save) return line0;
    return line0 + (today(i, i > save ? days[i - 1].line : line0, days[i].line) - line0) * pop;
  };
  const sold = !scene.airbag && (full > crash || (full === crash && forming && candle.low <= line0));
  const landed = scene.airbag && (full > crash || (full === crash && forming && f >= 0.66));
  const inLoan = scene.airbag && cur >= save ? today(cur, cur > save ? days[cur - 1].inLoan : 0, days[cur].inLoan) : 0;
  return { N, full, forming, cur, candle, price: candle.close, levelAt, level: levelAt(cur), sold, landed, cushion: scene.airbag && cur >= save && pop > 0.01, inLoan };
}
