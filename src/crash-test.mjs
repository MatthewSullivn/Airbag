// Pure logic for the landing page's crash test: what February 2026's replay (replay/results.json) says, in the
// handful of facts the car-and-wall picture is drawn from. Shared by the page (web/src/components/crash-test.tsx,
// through the @crash alias) and the tests, so every number the picture shows comes straight from the replay.

/**
 * The facts the crash test shows, or null when the replay does not tell the story (the loan left alone was never
 * sold, the loan with Airbag was sold too, or Airbag first acted after the sale).
 * @param {any} replay replay/results.json, as GET /api/replay serves it
 */
export function crashTestFacts(replay) {
  const untouched = replay?.headline?.untouched;
  const liq = untouched?.liquidation;
  const chart = replay?.chart;
  if (!liq || !Array.isArray(chart) || replay.headline.intraday?.liquidated) return null;
  const crashAt = chart.findIndex((d) => d.date === liq.date);
  const savedAt = chart.findIndex((d) => d.inLoan > 0);
  if (crashAt < 1 || savedAt < 0 || savedAt >= crashAt) return null;
  // the ride: three calm days before Airbag's first move (or more, so it is never shorter than six days), to the sale
  const from = Math.max(0, Math.min(savedAt - 3, crashAt - 5));
  const days = chart.slice(from, crashAt + 1).map((d) => ({ date: d.date, low: d.low }));
  return {
    days,
    saveIndex: savedAt - from,
    crash: days[days.length - 1],
    line0: untouched.line0,
    debt0: untouched.debt0,
    btcKept: liq.btcKept,
    daysEarly: Math.round((Date.parse(liq.date) - Date.parse(chart[savedAt].date)) / 86_400_000),
  };
}
