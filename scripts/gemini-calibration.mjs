// How good are the odds? A check of Gemini's bitcoin price ladders that have already SETTLED.
//
// Airbag trusts two things: that a bet's price is the chance it comes true, and that a loan's danger is about
// twice the chance bitcoin ENDS below its line (because touching the line at any moment is enough). This script
// checks both against what happened, with public data only (no key, read only):
//   - Gemini's hourly and daily "BTC price ..." ladders of the last HOURS hours, which have settled
//     (GET /v1/prediction-markets/events/<ticker>: each bet says how it resolved)
//   - each bet's own trades (GET /v2/candles/<bet>/5m: the windows with volume)
//   - bitcoin's 5-minute prices (GET /v2/candles/btcusd/5m), to know whether a price was touched on the way
// It writes replay/gemini-calibration.json.   Run: npm run calibration            (about 10 minutes)
//                                                   npm run calibration -- 72      (more hours back)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { summarize } from "../src/calibration.mjs";

const API = "https://api.gemini.com";
const HOURS = Number(process.argv[2] ?? 48);
const PAUSE_MS = 900;                 // Gemini allows about 120 requests a minute: stay well under it
const FRAME_MS = 5 * 60_000;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "replay", "gemini-calibration.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(PAUSE_MS);
    calls++;
    try {
      const r = await fetch(API + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.status === 429) { await sleep(10_000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1500); }
  }
  return null;
}

// bitcoin itself, in 5-minute steps (Gemini returns the newest first): about a week
const btc = ((await get("/v2/candles/btcusd/5m")) ?? []).map((r) => ({ t: r[0], low: r[3], close: r[4] })).sort((a, b) => a.t - b.t);
if (btc.length < 100) throw new Error("no bitcoin prices from Gemini");
console.log(`bitcoin 5-minute prices: ${btc.length}, from ${new Date(btc[0].t).toISOString()}`);
/** Bitcoin at a moment, and its lowest price from then until `end`. */
function path(at, end) {
  let then = null, low = Infinity;
  for (const k of btc) {
    if (k.t + FRAME_MS <= at) then = k.close;
    else if (k.t < end) low = Math.min(low, k.low);
  }
  return then == null || low === Infinity ? null : { btc: then, low };
}

// every hourly ladder that ended in the last HOURS hours (the 22:00 UTC one is the daily ladder): BTC + YYMMDD + HHMM
const two = (n) => String(n).padStart(2, "0");
const tickers = [];
const thisHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
for (let end = thisHour; end > thisHour - HOURS * 3_600_000; end -= 3_600_000) {
  if (end < btc[0].t + 3_600_000) break;                    // no bitcoin prices that far back
  const d = new Date(end);
  tickers.push(`BTC${two(d.getUTCFullYear() % 100)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}00`);
}

const bets = [];
let ladders = 0, volume = 0;
for (const ticker of tickers) {
  const e = await get(`/v1/prediction-markets/events/${ticker}`);
  if (!e || e.status !== "settled" || !e.contracts?.length) continue;
  ladders++;
  volume += Number(e.volume ?? 0);
  const end = Date.parse(e.expiryDate);
  for (const c of e.contracts) {
    if (c.strike?.type && c.strike.type !== "above") continue;
    const strike = Number(c.strike?.value);
    if (!Number.isFinite(strike) || !c.instrumentSymbol || !["yes", "no"].includes(c.resolutionSide)) continue;
    const rows = await get(`/v2/candles/${encodeURIComponent(c.instrumentSymbol)}/5m`);
    // only the windows in which the bet really traded: a carried-forward price is not a forecast
    const trades = (Array.isArray(rows) ? rows : [])
      .filter((r) => r[5] > 0 && r[4] > 0 && r[4] < 1)
      .map((r) => ({ t: r[0] + FRAME_MS, p: r[4], v: r[5] }))
      .filter((x) => x.t < end)
      .sort((a, b) => a.t - b.t)
      .map((x) => ({ ...x, ...(path(x.t, end) ?? {}) }));
    bets.push({ ticker, symbol: c.instrumentSymbol, end, strike, yes: c.resolutionSide === "yes", settled: Number(c.settlementValue), trades });
  }
  if (ladders % 6 === 0) console.log(`  ${ladders} ladders, ${bets.length} bets (${calls} requests)`);
}

const result = {
  madeAt: new Date().toISOString(),
  source: "Gemini public API: settled hourly and daily BTC price ladders, each bet's 5-minute candles (traded windows only), btcusd 5-minute candles",
  hours: HOURS,
  ladders,
  volume: Math.round(volume),
  from: bets.length ? new Date(Math.min(...bets.map((b) => b.end))).toISOString() : null,
  to: bets.length ? new Date(Math.max(...bets.map((b) => b.end))).toISOString() : null,
  summary: summarize(bets),
  bets,
};
writeFileSync(out, JSON.stringify(result) + "\n");
// the page shows the summary only (web/src/components/odds-check.tsx): rebuild the page after a new run
const { bets: _all, ...small } = result;
writeFileSync(join(dirname(out), "..", "web", "src", "recorded", "gemini-calibration.json"), JSON.stringify(small, null, 1) + "\n");
console.log(`wrote ${out}: ${bets.length} bets from ${ladders} ladders, ${calls} requests`);
console.log(JSON.stringify(result.summary, null, 1));
