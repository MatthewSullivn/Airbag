// How good were Gemini's odds? Pure logic for scripts/gemini-calibration.mjs and its test: no fetching in here.
//
// A "bet" is one settled contract of a bitcoin price ladder ("$63,000 or above at 9pm"):
//   { strike, yes, end, trades: [{ t, p, btc, low }] }
//     yes     bitcoin ended at or above the strike
//     end     when the bet ended (ms)
//     trades  every 5-minute window in which the bet traded, oldest first:
//               t    the end of that window (ms)
//               p    the price paid for "Yes" (0 to 1) = the market's chance of "yes" at that moment
//               btc  bitcoin's price at that moment
//               low  bitcoin's lowest price from that moment to the end
//
// Gemini's candles hold the last TRADED price, and these markets trade thinly: a price can sit for hours while
// bitcoin moves. So only real trades count as forecasts here, never a price carried forward.

/** The buckets a forecast is sorted into: [from, to) in chance of "yes". */
export const BUCKETS = [[0, 0.1], [0.1, 0.3], [0.3, 0.7], [0.7, 0.9], [0.9, 1.0001]];

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * One forecast per bet: its last trade at least `minMinutes` before the end (a trade in the final minutes is
 * closer to a result than a forecast). Bets that never traded in time give none.
 */
export function forecasts(bets, { minMinutes = 10, maxMinutes = 24 * 60 } = {}) {
  const out = [];
  for (const b of bets ?? []) {
    const ok = (b.trades ?? []).filter((x) => x.p != null && Number.isFinite(x.p) && b.end - x.t >= minMinutes * 60_000 && b.end - x.t <= maxMinutes * 60_000);
    const last = ok[ok.length - 1];
    if (last) out.push({ strike: b.strike, yes: !!b.yes, p: last.p, btc: last.btc ?? null, low: last.low ?? null, minutes: Math.round((b.end - last.t) / 60_000) });
  }
  return out;
}

/** Calibration: of the bets the market priced at about X%, how many came true? */
export function calibration(fs) {
  const rows = BUCKETS.map(([from, to]) => {
    const inside = fs.filter((f) => f.p >= from && f.p < to);
    return { from, to: Math.min(1, to), bets: inside.length, said: mean(inside.map((f) => f.p)), happened: mean(inside.map((f) => (f.yes ? 1 : 0))) };
  });
  // Brier score: the mean squared miss. 0 is perfect; always saying 50% scores 0.25.
  return { bets: fs.length, brier: mean(fs.map((f) => (f.p - (f.yes ? 1 : 0)) ** 2)), rows };
}

/**
 * The doubling. For bets whose strike was BELOW bitcoin's price at the moment of the trade (like a loan's line):
 *   said     the market's chance bitcoin would END below the strike
 *   ended    how often it did
 *   touched  how often it was below the strike at some moment on the way (ending below counts as touching)
 * Airbag says a loan's danger is 2 x "said". touched / said is the factor the data asks for.
 * `band` keeps the bets the market gave a real chance of ending below, where the question matters.
 */
export function touchVersusEnd(fs, { band = [0.02, 0.5] } = {}) {
  const used = fs
    .filter((f) => f.btc != null && f.low != null && f.strike < f.btc)
    .map((f) => ({ said: 1 - f.p, ended: !f.yes, touched: !f.yes || f.low < f.strike }))
    .filter((f) => f.said >= band[0] && f.said <= band[1]);
  const said = mean(used.map((f) => f.said)), ended = mean(used.map((f) => (f.ended ? 1 : 0))), touched = mean(used.map((f) => (f.touched ? 1 : 0)));
  return { bets: used.length, said, ended, touched, factorSeen: ended ? touched / ended : null, factorVsMarket: said ? touched / said : null };
}

export function summarize(bets, opts) {
  const fs = forecasts(bets, opts);
  return { traded: fs.length, of: (bets ?? []).length, medianMinutesBefore: fs.length ? [...fs].sort((a, b) => a.minutes - b.minutes)[Math.floor(fs.length / 2)].minutes : null, calibration: calibration(fs), touch: touchVersusEnd(fs) };
}
