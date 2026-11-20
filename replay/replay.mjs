// M7 step 2: the crash replay. Re-runs Airbag's real rule (decide() from src/brain.mjs) over a
// year of daily BTC prices and compares three borrowers who all open a loan on Dec 16, 2025:
//   untouched - nobody watches the loan
//   daily     - Airbag, but it only checks once a day, at the daily close
//   intraday  - Airbag reacting during the drop (each day walks open -> high -> low -> close in small steps)
// Odds: Gemini keeps no history of its prediction-market prices, so past volatility stands in for them:
//   P(loan dies within H days) = 2 * Phi( ln(line / price) / (sigma * sqrt(H)) )      (same doubling as the bot)
// with sigma = stdev of the previous 30 daily log returns. No fees, no interest. Whole loan liquidated.
//   node replay/replay.mjs          (reads replay/btc-daily.csv, writes replay/results.json)
import { readFileSync, writeFileSync } from "node:fs";
import { decide, normCdf, RULE } from "../src/brain.mjs";

const P = {
  start: "2025-12-16",
  lltv: 0.86,
  limit: 0.05,                       // the user's limit, same default as the bot
  horizonDays: 14,                   // like the ~2-week Gemini ladder the bot reads
  volWindowDays: 30,
  savingsPct: 0.2,                   // savings pot = 20% of the loan
  stepsPerLeg: 48,                   // intraday: 48 steps per leg, 3 legs a day
  ltvs: [0.5, 0.55, 0.6, 0.65, 0.7],
  headlineLtv: 0.6,
  chart: { from: "2026-01-15", to: "2026-03-15" },
};
// Morpho Blue liquidation incentive: min(1.15, 1 / (0.3 * LLTV + 0.7))
const LIF = Math.min(1.15, 1 / (0.3 * P.lltv + 0.7));

const csv = readFileSync(new URL("./btc-daily.csv", import.meta.url), "utf8").trim().split("\n").slice(1);
const days = csv.map((line) => {
  const [date, o, h, l, c] = line.split(",");
  return { date, open: +o, high: +h, low: +l, close: +c };
});
const i0 = days.findIndex((d) => d.date === P.start);
if (i0 < 15) throw new Error(`need at least 15 days of prices before ${P.start}`);

// stdev of daily log returns over the window before day i (no look-ahead; shorter at the very start of the data)
function sigmaBefore(i) {
  const r = [];
  for (let k = Math.max(1, i - P.volWindowDays); k < i; k++) r.push(Math.log(days[k].close / days[k - 1].close));
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
}
const oddsModel = (price, sigma) => {
  const s = sigma * Math.sqrt(P.horizonDays);
  return (line) => (line <= 0 ? 0 : Math.min(1, 2 * normCdf(Math.log(line / price) / s)));
};

function simulate(ltv, mode) {
  const p0 = days[i0].close;
  const collateral = 1;                              // 1 BTC
  let debt = ltv * p0 * collateral;
  const savingsTotal = P.savingsPct * debt;
  let pot = savingsTotal, inLoan = 0, maxInLoan = 0, actions = 0, potShareSum = 0, nDays = 0;
  let liquidation = null;
  const series = [];
  const line = () => debt / (collateral * P.lltv);

  const act = (price, sigma) => {
    const d = decide({ debt, collateral, btcPrice: price, lltv: P.lltv }, null, pot, inLoan, P.limit, { oddsAt: oddsModel(price, sigma) });
    if (d.action === "repay") {
      const a = Math.min(d.repay, pot, debt);
      debt -= a; pot -= a; inLoan += a; actions++;
      maxInLoan = Math.max(maxInLoan, inLoan);
    } else if (d.action === "give_back") {
      debt += d.borrow; pot += d.borrow; inLoan -= d.borrow; actions++;
    }
    return d;
  };
  const liquidate = (date, price) => {
    const seized = Math.min(collateral, (debt * LIF) / price);
    liquidation = { date, price: Math.round(price), btcKept: +(collateral - seized).toFixed(4) };
  };

  for (let i = i0 + 1; i < days.length && !liquidation; i++) {
    const day = days[i];
    const sigma = sigmaBefore(i);
    if (mode === "untouched") {
      if (day.low <= line()) liquidate(day.date, line());
    } else if (mode === "daily") {
      if (day.low <= line()) liquidate(day.date, line());
      else act(day.close, sigma);
    } else {
      // worst order for a borrower: up first (the bot may give savings back), then the drop, then the close
      const legs = [[day.open, day.high], [day.high, day.low], [day.low, day.close]];
      walk: for (const [a, b] of legs)
        for (let s = 1; s <= P.stepsPerLeg; s++) {
          const price = a + ((b - a) * s) / P.stepsPerLeg;
          if (price <= line()) { liquidate(day.date, line()); break walk; }
          act(price, sigma);
        }
    }
    nDays++;
    potShareSum += pot / savingsTotal;
    series.push({
      date: day.date,
      low: day.low,
      close: day.close,
      line: liquidation ? null : Math.round(line()),
      inLoan: Math.round(inLoan),
      odds: +oddsModel(day.close, sigma)(line()).toFixed(4),
    });
  }
  return {
    ltv,
    mode,
    openPrice: p0,
    debt0: Math.round(ltv * p0),
    line0: Math.round((ltv * p0) / P.lltv),
    savings: Math.round(savingsTotal),
    liquidated: !!liquidation,
    liquidation,
    btcKept: liquidation ? liquidation.btcKept : 1,
    maxInLoan: Math.round(maxInLoan),
    avgInPot: +(potShareSum / Math.max(1, nDays)).toFixed(3),
    actions,
    series,
  };
}

const table = [];
for (const ltv of P.ltvs) for (const mode of ["untouched", "daily", "intraday"]) table.push(simulate(ltv, mode));

const pick = (ltv, mode) => table.find((r) => r.ltv === ltv && r.mode === mode);
const inWindow = (d) => d.date >= P.chart.from && d.date <= P.chart.to;
const head = { untouched: pick(P.headlineLtv, "untouched"), intraday: pick(P.headlineLtv, "intraday"), daily: pick(P.headlineLtv, "daily") };
const byDate = (s) => new Map(s.series.map((d) => [d.date, d]));
const u = byDate(head.untouched), a = byDate(head.intraday);
const chart = head.intraday.series.filter(inWindow).map((d) => ({
  date: d.date,
  low: d.low,
  close: d.close,
  untouchedLine: u.get(d.date)?.line ?? null,     // null once it has been liquidated
  untouchedLine0: head.untouched.line0,
  airbagLine: a.get(d.date)?.line ?? null,
  inLoan: d.inLoan,
  odds: d.odds,
}));

const strip = ({ series, ...rest }) => rest;
const results = {
  generatedAt: new Date().toISOString(),
  params: { ...P, liquidationIncentive: +LIF.toFixed(5), rule: RULE, data: "Gemini v2 candles btcusd 1day (replay/btc-daily.csv)" },
  headline: { untouched: strip(head.untouched), daily: strip(head.daily), intraday: strip(head.intraday) },
  table: table.map(strip),
  chart,
};
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1));

const fmt = (r) =>
  `${(r.ltv * 100).toFixed(0)}%  ${r.mode.padEnd(9)} ${r.liquidated ? `LIQUIDATED ${r.liquidation.date} at $${r.liquidation.price}, keeps ${r.btcKept} BTC` : "kept 1 BTC"}`.padEnd(70) +
  (r.mode === "untouched" ? "" : `max in loan $${r.maxInLoan.toLocaleString("en-US")} of $${r.savings.toLocaleString("en-US")}, ${(r.avgInPot * 100).toFixed(0)}% stayed in the pot, ${r.actions} moves`);
console.log(`Loan opened ${P.start}: 1 BTC at $${days[i0].close}. Limit ${P.limit * 100}%, savings ${P.savingsPct * 100}% of the loan, odds horizon ${P.horizonDays} days.\n`);
for (const r of table) console.log(fmt(r));
console.log(`\nwrote replay/results.json (${chart.length} chart days, ${P.chart.from} .. ${P.chart.to})`);
