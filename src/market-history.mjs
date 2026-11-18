// The market's own history. Gemini keeps hourly candles for every bet of a ladder:
//   GET https://api.gemini.com/v2/candles/<instrumentSymbol>/1hr  ->  [[time, open, high, low, close, volume], ...]
// newest first, starting at the bet's first trade. The close is the last TRADED price of "Yes" (the chance
// bitcoin ends at or above the bet's price), so 1 - close is the chance it ends below. Between trades the close
// just repeats, so only the hours with volume are new information.
// Pure logic, no dependencies (like brain.mjs): the server, the page and the tests share it. Read-only data.

/** Raw candle rows -> [[t, pAbove, volume], ...], oldest first. Rows that are not a time and a price in 0..1 are dropped. */
export function pointsFromCandles(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const t = Number(r[0]), close = Number(r[4]), volume = Number(r[5]);
    if (!Number.isFinite(t) || !Number.isFinite(close) || close < 0 || close > 1) continue;
    out.push([t, close, Number.isFinite(volume) && volume > 0 ? volume : 0]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** How much a bet really traded: the hours with a trade, the contracts traded, and how far the price moved. */
export function activity(points) {
  let hours = 0, volume = 0, low = Infinity, high = -Infinity;
  for (const [, p, v] of points ?? []) {
    if (v > 0) { hours++; volume += v; }
    if (p < low) low = p;
    if (p > high) high = p;
  }
  return { hours, volume, low: Number.isFinite(low) ? low : null, high: Number.isFinite(high) ? high : null };
}

/**
 * The bets worth drawing, nearest the price now first: that is where the danger to a loan is priced. Only bets
 * that traded in at least `minHours` different hours count (a bet with one trade is a flat line). Without a
 * price, the busiest come first.
 */
export function worthDrawing(series, spot, { minHours = 2, max = 4 } = {}) {
  return (series ?? [])
    .map((s) => ({ ...s, activity: activity(s.points) }))
    .filter((s) => s.activity.hours >= minHours)
    .sort((a, b) => (spot != null ? Math.abs(a.strike - spot) - Math.abs(b.strike - spot) : 0) || b.activity.hours - a.activity.hours)
    .slice(0, max);
}
