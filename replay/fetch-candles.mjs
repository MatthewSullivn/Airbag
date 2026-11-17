// M7 step 1: pull a year of daily BTC/USD candles from Gemini and save them as CSV (oldest first).
//   node replay/fetch-candles.mjs
import { writeFileSync } from "node:fs";

const URL = "https://api.gemini.com/v2/candles/btcusd/1day";
const res = await fetch(URL);
if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
const rows = (await res.json())                     // [timeMs, open, high, low, close, volume], newest first
  .map(([t, o, h, l, c, v]) => ({ date: new Date(t).toISOString().slice(0, 10), o, h, l, c, v }))
  .sort((a, b) => a.date.localeCompare(b.date));

const csv = ["date,open,high,low,close,volume", ...rows.map((r) => [r.date, r.o, r.h, r.l, r.c, r.v].join(","))].join("\n") + "\n";
const out = new globalThis.URL("./btc-daily.csv", import.meta.url);
writeFileSync(out, csv);
console.log(`saved ${rows.length} days (${rows[0].date} .. ${rows.at(-1).date}) from ${URL} to replay/btc-daily.csv`);
