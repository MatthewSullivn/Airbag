// M3: read the live Gemini ladders and print "odds the loan dies" for a few lines.
//   npm run odds                      -> the BTC price ladders the bot uses
//   npm run odds -- BTC2611302200     -> one specific ladder
import { fetchEvent, fitTail, makeOddsModel } from "../src/brain.mjs";

const tickers = process.argv.slice(2).length ? process.argv.slice(2) : ["BTC2611302200", "BTC2611202200"];
const spot = Number((await (await fetch("https://api.gemini.com/v1/pubticker/btcusd")).json()).last);
console.log(`BTC/USD on Gemini: $${spot.toLocaleString("en-US")}\n`);

const events = [];
for (const t of tickers) {
  try {
    const e = await fetchEvent(t);
    events.push(e);
    const tail = fitTail(e.ladder);
    console.log(`${t}  "${e.title}"  ${e.status}  expires ${e.expiryDate}  volume $${Math.round(e.volume ?? 0).toLocaleString("en-US")}`);
    console.log(`  ${e.ladder.length} bets from $${e.ladder[0]?.strike} to $${e.ladder.at(-1)?.strike}`);
    if (tail) console.log(`  log-normal fit: median $${Math.round(tail.median)}, sigma ${tail.sigma.toFixed(4)}`);
  } catch (err) {
    console.log(`${t}: ${err.message}`);
  }
}
const { detail } = makeOddsModel(events);
console.log("\nhealth  line        odds the loan dies (worse of the ladders)");
for (const h of [1.6, 1.5, 1.4, 1.3, 1.25, 1.2, 1.15, 1.1, 1.05]) {
  const line = spot / h;
  const d = detail(line);
  console.log(`${h.toFixed(2).padStart(5)}   $${Math.round(line).toLocaleString("en-US").padEnd(9)} ${d ? `${(d.odds * 100).toFixed(2)}%  (${d.source}, ${d.ticker})` : "no odds"}`);
}
