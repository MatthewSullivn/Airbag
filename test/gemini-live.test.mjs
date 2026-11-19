// Gemini's live feed (src/gemini-live.mjs), checked on real messages recorded from wss://ws.gemini.com on
// Nov 19, 2026 (UTC) for the BTC2611302200 ladder, next to the REST event read in the same second.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ladderFromEvent, oddsLoanDiesEst } from "../src/brain.mjs";
import { betsFromEvent, hedgeQuote } from "../src/hedge.mjs";
import { betsAround, buyNoOf, chanceOf, liveLadder, moved, readMessage, subscribeMessage } from "../src/gemini-live.mjs";

const rec = JSON.parse(readFileSync(new URL("./fixtures/gemini-feed-BTC2611302200.json", import.meta.url), "utf8"));
const rest = ladderFromEvent(rec.event);             // what the bot reads
const bets = betsFromEvent(rec.event);               // strike -> symbol
const symbols = rec.event.contracts.map((c) => c.instrumentSymbol);

/** Replay the first `n` recorded messages, the way the page keeps them: the newest quote of each bet. */
function quotesAfter(n) {
  const quotes = {};
  for (const m of rec.messages.slice(0, n)) {
    const msg = readMessage(m);
    if (msg?.kind === "quote") quotes[msg.symbol] = msg;
  }
  return quotes;
}
// Gemini answers a subscription with every bet's current prices: the reply, then one message per bet
const AT_START = 1 + symbols.length;
// the server's last read, made wrong on purpose, to prove a number came from the feed
const stale = rest.map((p) => ({ strike: p.strike, pAbove: 0.5 }));

test("one message asks for every bet's prices and trades", () => {
  const m = subscribeMessage(["GEMI-A", "GEMI-B"]);
  assert.equal(m.method, "SUBSCRIBE");
  assert.deepEqual(m.params, ["GEMI-A@bookTicker", "GEMI-A@trade", "GEMI-B@bookTicker", "GEMI-B@trade"]);
  assert.deepEqual(subscribeMessage([]).params, []);
});

test("Gemini's reply and every recorded message is understood", () => {
  assert.deepEqual(readMessage(rec.messages[0]), { kind: "answer", ok: true });
  assert.deepEqual(readMessage({ id: "airbag", status: 400 }), { kind: "answer", ok: false });
  const heard = new Set();
  for (const raw of rec.messages.slice(1)) {
    const m = readMessage(raw);
    assert.equal(m?.kind, "quote", JSON.stringify(raw));
    assert.ok(symbols.includes(m.symbol), `${m.symbol} is written the way the REST API writes it`);
    for (const side of [m.bid, m.ask]) assert.ok(side == null || (side >= 0 && side <= 1));
    if (m.bid != null && m.ask != null) assert.ok(m.ask >= m.bid, "the ask is never under the bid");
    heard.add(m.symbol);
  }
  assert.equal(heard.size, symbols.length, "every bet answers the subscription with its current prices");
  for (const junk of [null, 7, "text", {}, { s: "" }, { s: "gemi-x" }]) assert.equal(readMessage(junk), null);
});

test("an empty bid means nobody is bidding: no price, not a price of zero", () => {
  const raw = rec.messages.find((m) => m.s && m.b === "");
  assert.ok(raw, "the recording has a bet nobody bids on");
  const m = readMessage(raw);
  assert.equal(m.bid, null);
  assert.ok(m.ask > 0);
  assert.equal(chanceOf(m), m.ask, "one side quoted: that side is the chance, the way brain.mjs reads REST");
  assert.equal(buyNoOf(m), null, "and nobody sells a No there");
  assert.equal(chanceOf({ bid: null, ask: null }), null);
  assert.equal(chanceOf(undefined), null);
  assert.equal(chanceOf({ bid: 0.52, ask: 0.54 }), 0.53);
});

test("the feed's prices give exactly the ladder the bot reads from REST at that moment", () => {
  const live = liveLadder(stale, bets, quotesAfter(AT_START));
  assert.equal(live.length, rest.length);
  for (let i = 0; i < rest.length; i++) {
    assert.equal(live[i].strike, rest[i].strike);
    assert.ok(Math.abs(live[i].pAbove - rest[i].pAbove) < 1e-9, `${rest[i].strike}: feed ${live[i].pAbove}, REST ${rest[i].pAbove}`);
    assert.equal(live[i].live, true);
  }
  // so a loan's number worked out on the page from the feed is the bot's number
  for (const line of [42_000, 50_400, 58_900, 61_000, 66_000]) {
    const a = oddsLoanDiesEst(live, line), b = oddsLoanDiesEst(rest, line);
    assert.ok(Math.abs(a.odds - b.odds) < 1e-9, `line ${line}`);
    assert.equal(a.source, b.source);
  }
});

test("later messages move the ladder, and it stays a ladder", () => {
  const before = liveLadder(rest, bets, quotesAfter(AT_START));
  const after = liveLadder(rest, bets, quotesAfter(rec.messages.length));
  assert.ok(after.some((p, i) => p.pAbove !== before[i].pAbove), "the market moved while we recorded");
  for (let i = 1; i < after.length; i++) {
    assert.ok(after[i].strike > after[i - 1].strike);
    assert.ok(after[i].pAbove <= after[i - 1].pAbove, "a higher price is never likelier than a lower one");
  }
  for (const p of after) assert.ok(p.pAbove >= 0 && p.pAbove <= 1);
});

test("the bot is woken when a bet's chance moves, not by every message", () => {
  assert.equal(moved(undefined, 0.85), false, "the first price heard for a bet is not a move");
  assert.equal(moved(0.85, 0.85), false);
  assert.equal(moved(0.855, 0.86), true, "half a cent: the bid or the ask moved by a cent");
  assert.equal(moved(0.86, 0.855), true);
  assert.equal(moved(0.85, null), false, "a bet nobody quotes any more is not a move to act on");
  // replay the recording the way the server listens: Gemini's first answers set the prices, later ones move them
  const chance = new Map();
  let messages = 0, moves = 0;
  for (const raw of rec.messages) {
    const m = readMessage(raw);
    if (m?.kind !== "quote") continue;
    messages++;
    const to = chanceOf(m), from = chance.get(m.symbol);
    if (to == null) continue;
    chance.set(m.symbol, to);
    if (moved(from, to)) moves++;
  }
  assert.ok(moves >= 1, "the market moved while we recorded");
  assert.ok(moves <= messages - symbols.length, "the prices Gemini sends on connecting are not moves");
});

test("without the feed, the server's own read comes back as it was, and says so", () => {
  for (const quotes of [null, undefined, {}]) {
    const same = liveLadder(rest, bets, quotes);
    assert.deepEqual(same.map((p) => [p.strike, p.pAbove]), rest.map((p) => [p.strike, p.pAbove]));
    assert.ok(same.every((p) => p.live === false && p.bid == null && p.ask == null));
  }
  // one bet heard, the rest not: only that one changes
  const [first] = bets;
  const one = liveLadder(rest, bets, { [first.symbol]: { bid: 0.9, ask: 0.92 } });
  assert.equal(one[0].live, true);
  assert.ok(Math.abs(one[0].pAbove - 0.91) < 1e-9);
  assert.ok(one.slice(1).every((p) => p.live === false));
  assert.deepEqual(liveLadder(null, null, null), []);
});

test("a No costs one dollar minus the best bid, the same price the REST API quotes", () => {
  const quotes = quotesAfter(AT_START);
  let checked = 0;
  for (const b of bets) {
    const q = quotes[b.symbol];
    if (q.bid == null) continue;
    assert.ok(Math.abs(buyNoOf(q) - b.buyNo) < 1e-9, `${b.strike}: feed ${buyNoOf(q)}, REST ${b.buyNo}`);
    checked++;
  }
  assert.ok(checked >= 8);
  // so the hedge ticket's live price is the quote the server would give
  const withFeed = bets.map((b) => ({ ...b, buyNo: buyNoOf(quotes[b.symbol]) ?? b.buyNo }));
  const a = hedgeQuote({ bets: withFeed, line: 50_400, debt: 100_000, lltv: 0.86 }), z = hedgeQuote({ bets, line: 50_400, debt: 100_000, lltv: 0.86 });
  assert.equal(a.strike, z.strike);
  assert.ok(Math.abs(a.cost - z.cost) < 1e-6);
});

test("the bets shown next to a loan are the ones its price sits between", () => {
  const strikes = (line, n) => betsAround(rest, line, n).map((p) => p.strike);
  const lowest = rest[0].strike, second = rest[1].strike, top = rest[rest.length - 1].strike;
  assert.deepEqual(strikes((lowest + second) / 2), [lowest, second]);
  assert.deepEqual(strikes(lowest - 8000), [lowest, second], "a healthy loan is below every bet: the two lowest");
  assert.deepEqual(strikes(top + 5000), [rest[rest.length - 2].strike, top]);
  assert.deepEqual(strikes(second), [lowest, second], "exactly on a bet: that bet and the one under it");
  assert.equal(strikes(61_000, 3).length, 3);
  assert.deepEqual(betsAround([], 60_000), []);
  assert.deepEqual(betsAround(rest.slice(0, 1), 60_000).length, 1);
});
