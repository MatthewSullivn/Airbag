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
// The page tells the story as the visitor scrolls: a position s runs from 0 (the top of the page) through six
// captions to 7. These functions say what the chart shows at each position. They are here, not in the page, so the
// tests can walk the whole story and check that the picture never says something the replay does not.

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (x, a, b) => clamp((x - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);

/** The airbag opens this far into the day the odds pass the limit. */
export const OPEN_AT = 0.4;
/** The story's last position. */
export const STORY_END = 7;

/**
 * The days the story turns on, as counts of candles: all of them, the calm before the fall, the day Airbag first
 * moves, the day of the crash.
 * @param {{ days: unknown[], saveIndex: number, crashIndex: number }} story
 */
export function storyKeys(story) {
  return { N: story.days.length, calm: Math.max(1, story.crashIndex - 8), save: story.saveIndex, crash: story.crashIndex };
}

/**
 * What is on the chart at story position s: how many candles (the last one may be half made), and whether Airbag is on.
 *   0  the ending with Airbag, then rewinding to the calm before the fall as the visitor starts to scroll
 *   1  the loan and its line          2  bitcoin falls for a week      3  it touches the line: sold
 *   4  rewind, and Airbag comes on    5  the airbag opens              6  the same candle lands on it
 * @param {number} s
 * @param {{ N: number, calm: number, save: number, crash: number }} keys
 */
export function sceneAt(s, { N, calm, save, crash }) {
  if (s < 1) return { n: lerp(N, calm, smooth(seg(s, 0.1, 0.9))), airbag: true };
  if (s < 2) return { n: calm, airbag: false };
  if (s < 3) return { n: lerp(calm, crash, seg(s, 2.04, 2.96)), airbag: false };
  if (s < 4) return { n: s < 3.56 ? lerp(crash, crash + 1, seg(s, 3.04, 3.52)) : lerp(crash + 1, N, seg(s, 3.56, 3.96)), airbag: false };
  if (s < 5) return s < 4.6 ? { n: lerp(N, save, smooth(seg(s, 4.04, 4.56))), airbag: false } : { n: save, airbag: true };
  if (s < 6) return { n: lerp(save, crash, seg(s, 5.04, 5.96)), airbag: true };
  if (s < 7) return { n: s < 6.56 ? lerp(crash, crash + 1, seg(s, 6.04, 6.52)) : lerp(crash + 1, N, seg(s, 6.56, 6.96)), airbag: true };
  return { n: N, airbag: true };
}

/** How long the ending with Airbag plays by itself when the page opens, in seconds. */
export const INTRO_SECONDS = 5.6;
/**
 * That ending, second by second: how many candles are on the chart t seconds in.
 * @param {number} t
 * @param {{ N: number, calm: number, save: number, crash: number }} keys
 */
export function introAt(t, { N, calm, save, crash }) {
  if (t < 0.7) return calm;
  if (t < 1.9) return lerp(calm, save, smooth(seg(t, 0.7, 1.9)));
  if (t < 4.5) return lerp(save, crash + 1, seg(t, 1.9, 4.5));
  return lerp(crash + 1, N, 1 - (1 - seg(t, 4.5, INTRO_SECONDS)) ** 3);
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
