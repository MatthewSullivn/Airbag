// brain.mjs  -  the whole "brain" of Airbag in one small file. No dependencies. Node 22+.
//
// Starts from the version in the project plan (section 11). Its original functions and its
// test still behave exactly the same. On top of it, the plan's three "things to improve":
//   1. read the strike from Gemini's structured `strike` field (label parsing is the fallback)
//   2. estimate the odds below Gemini's lowest bet from the shape of the ladder, instead of "no odds"
//   3. combine several ladders (e.g. Friday and Nov 30) and take the worse odds
// decide() accepts an optional `oddsAt(line)` function so the bot (live odds) and the crash
// replay (odds from past volatility) run the exact same rule.

export const LLTV = 0.86;                              // liquidation loan-to-value of the Arc cirBTC/USDC market
const GEMINI = "https://api.gemini.com/v1/prediction-markets/events/";

// The rule's health numbers (plan section 11, "tune the numbers").
export const RULE = Object.freeze({
  actBelowHealth: 1.10,   // act if health falls under this, whatever the odds say
  repayToHealth: 1.25,    // when acting, repay at least down to this health
  giveBackAbove: 1.40,    // only give savings back when health is above this ...
  giveBackFloor: 1.30,    // ... and never push health under this while giving back
});

// "$61,500 or above" -> 61500   (NaN when the label has no number)
const strikeOf = (label) => {
  const m = String(label ?? "").replace(/,/g, "").match(/([0-9]+(\.[0-9]+)?)/);
  return m ? Number(m[1]) : NaN;
};

// middle of bid and ask = the market's chance that BTC ends at or above the strike
function mid(prices) {
  const bid = prices?.bestBid != null ? Number(prices.bestBid) : null;
  const ask = prices?.bestAsk != null ? Number(prices.bestAsk) : null;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask;                                  // may be null if nobody is quoting
}

// Gemini event JSON -> sorted list of { strike, pAbove }
export function ladderFromEvent(event) {
  const pts = (event.contracts || [])
    .filter((c) => !c.strike?.type || c.strike.type === "above")      // only "$X or above" bets
    .map((c) => ({
      strike: c.strike?.value != null ? Number(c.strike.value) : strikeOf(c.label),
      pAbove: mid(c.prices),
    }))
    .filter((p) => Number.isFinite(p.strike) && p.pAbove != null && Number.isFinite(p.pAbove))
    .sort((a, b) => a.strike - b.strike);
  for (let i = 1; i < pts.length; i++) pts[i].pAbove = Math.min(pts[i].pAbove, pts[i - 1].pAbove); // tidy thin quotes
  return pts;
}

export async function fetchLadder(ticker) {           // e.g. "BTC2611202200"
  return (await fetchEvent(ticker)).ladder;
}

// Same as fetchLadder, plus what the dashboard needs to label it.
export async function fetchEvent(ticker) {
  const res = await fetch(GEMINI + ticker);
  if (!res.ok) throw new Error("Gemini HTTP " + res.status);
  const event = await res.json();
  return {
    ticker,
    title: event.title,
    status: event.status,
    expiryDate: event.expiryDate,
    volume: event.volume != null ? Number(event.volume) : null,
    ladder: ladderFromEvent(event),
  };
}

// Chance BTC is BELOW `price` when the bet ends. null = the ladder has no bet that low.
export function chanceBelow(ladder, price) {
  if (!ladder.length || price < ladder[0].strike) return null;
  const last = ladder[ladder.length - 1];
  if (price >= last.strike) return 1 - last.pAbove;
  for (let i = 1; i < ladder.length; i++) {
    const a = ladder[i - 1], b = ladder[i];
    if (price <= b.strike) {
      const t = (price - a.strike) / (b.strike - a.strike);
      return 1 - (a.pAbove + t * (b.pAbove - a.pAbove));
    }
  }
  return null;
}

// The loan dies if BTC dips under the line at ANY moment, not only at the end. Rough fix: double it.
// (For a random walk with no drift this is the reflection principle: P(min < L) = 2 * P(end < L).)
export const oddsLoanDies = (ladder, liqPrice) => {
  const p = chanceBelow(ladder, liqPrice);
  return p == null ? null : Math.min(1, 2 * p);
};

export const liqPrice = (debt, collateral, lltv = LLTV) => debt / (collateral * lltv);
export const health = (debt, collateral, btcPrice, lltv = LLTV) => (collateral * btcPrice * lltv) / debt;

// Highest liquidation price whose odds are at or under the limit. null = even the lowest bet is too risky.
export function safeLine(ladder, limit) {
  let best = null;
  for (let p = ladder[0].strike; p <= ladder[ladder.length - 1].strike; p += 50)
    if (oddsLoanDies(ladder, p) <= limit) best = p;
  return best;
}

// ---------------------------------------------------------------------------------------------
// Improvement 2: odds below the lowest bet.
// Fit a log-normal to the ladder (chance below K ~ Phi(a + b*ln K)), then use its shape to
// continue the curve under the lowest bet, anchored to that bet's quote so it stays continuous.

// Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
export function normCdf(z) {
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Inverse of the standard normal CDF (Acklam's algorithm, relative error < 1.2e-9).
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425, hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > hi) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Least-squares fit of z = a + b*ln(strike), where z = normInv(chance below). Uses bets priced
// between 2% and 98% (the floors and ceilings of a thin book say little). null = cannot fit.
export function fitTail(ladder) {
  const pts = ladder
    .filter((p) => p.pAbove > 0.02 && p.pAbove < 0.98 && p.strike > 0)
    .map((p) => ({ x: Math.log(p.strike), z: normInv(1 - p.pAbove) }));
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const mz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  let sxx = 0, sxz = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxz += (p.x - mx) * (p.z - mz); }
  if (sxx === 0) return null;
  const b = sxz / sxx;
  if (!(b > 0)) return null;
  const a = mz - b * mx;
  return { a, b, median: Math.exp(-a / b), sigma: 1 / b, points: pts.length };
}

// Chance BTC ends below `price`, never "no odds" while there is a ladder.
// Returns { p, source: "quoted" | "estimated" }, or null when there is no usable ladder.
export function chanceBelowEst(ladder, price, tail = fitTail(ladder)) {
  if (!ladder.length || !(price > 0)) return null;
  const quoted = chanceBelow(ladder, price);
  if (quoted != null) return { p: quoted, source: "quoted" };
  if (!tail) return null;
  const k0 = ladder[0].strike, q0 = 1 - ladder[0].pAbove;
  const f = (k) => normCdf(tail.a + tail.b * Math.log(k));
  const f0 = f(k0);
  if (!(f0 > 0)) return { p: 0, source: "estimated" };
  return { p: Math.min(q0, (q0 * f(price)) / f0), source: "estimated" };
}

// The odds the loan dies, using the estimated tail below the lowest bet.
export function oddsLoanDiesEst(ladder, line, tail) {
  const c = chanceBelowEst(ladder, line, tail);
  return c == null ? null : { odds: Math.min(1, 2 * c.p), source: c.source };
}

// ---------------------------------------------------------------------------------------------
// Improvement 3: several ladders, take the worse (higher) odds. `events` = [{ ticker, ladder }, ...].
// Returns { oddsAt(line) -> number | null, detail(line) -> { odds, source, ticker } | null, tails }.
export function makeOddsModel(events) {
  const usable = (events || [])
    .filter((e) => e && e.ladder && e.ladder.length)
    .map((e) => ({ ...e, tail: fitTail(e.ladder) }));
  const detail = (line) => {
    let worst = null;
    for (const e of usable) {
      const o = oddsLoanDiesEst(e.ladder, line, e.tail);
      if (o && (worst == null || o.odds > worst.odds)) worst = { ...o, ticker: e.ticker };
    }
    return worst;
  };
  return {
    oddsAt: (line) => detail(line)?.odds ?? null,
    detail,
    tails: usable.map((e) => ({ ticker: e.ticker, ...(e.tail || {}) })),
  };
}

// Highest line at or below `top` whose odds are at or under `limit`. Scans down in small steps.
// Unknown odds (null) count as "far from danger", the same as the original rule.
export function highestSafeLine(oddsAt, limit, top, { floor = top * 0.05, steps = 4000 } = {}) {
  const step = (top - floor) / steps;
  for (let p = top; p >= floor; p -= step) {
    const o = oddsAt(p);
    if (o == null || o <= limit) return p;
  }
  return floor;
}

/**
 * The rule. Returns what the bot should do right now.
 * loan    = { debt, collateral, btcPrice, lltv? }   (numbers, USDC and BTC)
 * ladder  = Gemini ladder (used when opts.oddsAt is not given)
 * savings = USDC available in the savings pot
 * inLoan  = savings the bot has already moved into the loan and not yet given back
 * limit   = the user's limit, e.g. 0.05 for 5%
 * opts    = { oddsAt?: (line) => number | null, rule?: Partial<RULE> }
 */
export function decide(loan, ladder, savings, inLoan, limit, opts = {}) {
  const rule = { ...RULE, ...(opts.rule || {}) };
  const lltv = loan.lltv ?? LLTV;
  const custom = typeof opts.oddsAt === "function";
  const oddsAt = custom ? opts.oddsAt : (p) => oddsLoanDies(ladder, p);
  const line = liqPrice(loan.debt, loan.collateral, lltv);
  const h = health(loan.debt, loan.collateral, loan.btcPrice, lltv);
  const odds = oddsAt(line);                          // null when nothing can be said (= far from danger)
  const danger = (odds != null && odds > limit) || h < rule.actBelowHealth;
  if (danger) {
    // Aim for the safe line from the odds. If the odds cannot say, aim for health repayToHealth.
    const fromHealth = loan.btcPrice / rule.repayToHealth;   // liquidation price that gives that health
    const fromOdds = custom ? highestSafeLine(oddsAt, limit, fromHealth) : safeLine(ladder, limit);
    const target = Math.min(fromOdds ?? fromHealth, fromHealth);
    const repay = Math.min(savings, Math.max(0, loan.debt - target * loan.collateral * lltv));
    return { action: repay > 0 ? "repay" : "out_of_savings", repay, odds, health: h, line, targetLine: target };
  }
  const calm = (odds == null || odds < limit / 2) && h > rule.giveBackAbove;
  if (calm && inLoan > 0) {
    // Give savings back, but never push health under giveBackFloor, nor the odds over half the limit.
    const roomHealth = (loan.collateral * loan.btcPrice * lltv) / rule.giveBackFloor - loan.debt;
    const maxLine = highestSafeLine(oddsAt, limit / 2, loan.btcPrice / rule.giveBackFloor);
    const roomOdds = maxLine * loan.collateral * lltv - loan.debt;
    const back = Math.max(0, Math.min(inLoan, roomHealth, roomOdds));
    if (back > 0) return { action: "give_back", borrow: back, odds, health: h, line };
  }
  return { action: "nothing", odds, health: h, line };
}
