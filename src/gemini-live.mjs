// Gemini's LIVE feed for its prediction-market bets, as pure logic. No socket in here and no dependencies (like
// brain.mjs), so the page, the server and the tests can all use the same functions.
//
// The feed is a public WebSocket, wss://ws.gemini.com: no key, read only. You send one SUBSCRIBE message with a
// list of streams, and Gemini pushes each bet's best bid and ask ("<symbol>@bookTicker") and every trade
// ("<symbol>@trade") the moment they change. Checked on Nov 19, 2026: one message can ask for all 33 bets of
// both bitcoin ladders (66 streams), every bet answers at once with its current prices, and the bid and ask on
// the feed are the same numbers the REST API returns as prices.bestBid and prices.bestAsk.

export const FEED_URL = "wss://ws.gemini.com";

/** The one message that asks for the best bid and ask, and the trades, of every bet in `symbols`. */
export function subscribeMessage(symbols, id = "airbag") {
  return { id, method: "SUBSCRIBE", params: (symbols ?? []).flatMap((s) => [`${s}@bookTicker`, `${s}@trade`]) };
}

// A price on the feed is text like "0.8400". An EMPTY text means nobody is quoting that side: that is "no
// price", not zero. Anything outside 0..1 is not a price of a bet.
const price = (x) => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};
const size = (x) => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * One message from the feed -> what it says. Symbols come back in lower case; they are returned in upper case,
 * the way the REST API writes them (GEMI-BTC2611302200-HI62500).
 *   { kind: "answer", ok }                                  Gemini's reply to SUBSCRIBE
 *   { kind: "quote", symbol, bid, ask, last, lastSize }     best bid and ask of "Yes" (0 to 1), and the last trade
 *   { kind: "trade", symbol, price, size, id }              one trade of "Yes"
 *   null                                                    anything else
 */
export function readMessage(j) {
  if (!j || typeof j !== "object") return null;
  if (typeof j.s !== "string" || !j.s) return "status" in j ? { kind: "answer", ok: j.status === 200 } : null;
  const symbol = j.s.toUpperCase();
  if (j.p != null && j.t != null) {
    const p = price(j.p);
    return p == null ? null : { kind: "trade", symbol, price: p, size: size(j.q) ?? 0, id: String(j.t) };
  }
  if ("b" in j || "a" in j) return { kind: "quote", symbol, bid: price(j.b), ask: price(j.a), last: price(j.c), lastSize: size(j.C) };
  return null;
}

/**
 * The market's chance that a bet ends "Yes", read exactly the way brain.mjs reads the REST prices: the middle
 * of bid and ask, or the one side that is quoted. null when nobody quotes either side.
 */
export function chanceOf(quote) {
  const bid = quote?.bid ?? null, ask = quote?.ask ?? null;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask;
}

/**
 * Has a bet's chance moved since the last message? Half a cent is the smallest step the middle of a bid and an
 * ask can take (prices move in whole cents). The first price heard for a bet is not a move.
 */
export const moved = (before, after, min = 0.005) => before != null && after != null && Math.abs(after - before) >= min - 1e-9;

/**
 * What one "No" costs right now. A "No" is bought from whoever bids for "Yes", so it costs 1 - the best bid.
 * null when nobody bids (the REST price is only an indication then).
 */
export function buyNoOf(quote) {
  const bid = quote?.bid ?? null;
  return bid != null && bid > 0 && bid < 1 ? 1 - bid : null;
}

/**
 * A ladder with the feed's fresher prices laid over it.
 *   ladder  [{ strike, pAbove }]      what the server last read (REST, cached about 20 s)
 *   bets    [{ strike, symbol }]      which feed symbol belongs to which strike
 *   quotes  { SYMBOL: { bid, ask } }  the newest quote heard for each bet
 * Every point keeps the server's number unless the feed has a price for it. The result is tidied the same way
 * as brain.ladderFromEvent (a higher price can never be likelier than a lower one), so the bot's own functions
 * (chanceBelowEst, oddsLoanDiesEst) can be run on it. Each point also says where its number came from.
 */
export function liveLadder(ladder, bets, quotes) {
  const symbolAt = new Map((bets ?? []).filter((b) => b && b.symbol).map((b) => [Number(b.strike), String(b.symbol).toUpperCase()]));
  const pts = (ladder ?? [])
    .map((p) => {
      const symbol = symbolAt.get(Number(p.strike)) ?? null;
      const q = symbol && quotes ? quotes[symbol] : undefined;
      const fresh = chanceOf(q);
      return { strike: Number(p.strike), pAbove: fresh ?? p.pAbove, symbol, bid: q?.bid ?? null, ask: q?.ask ?? null, last: q?.last ?? null, live: fresh != null };
    })
    .filter((p) => Number.isFinite(p.strike) && p.pAbove != null && Number.isFinite(p.pAbove))
    .sort((a, b) => a.strike - b.strike);
  for (let i = 1; i < pts.length; i++) pts[i].pAbove = Math.min(pts[i].pAbove, pts[i - 1].pAbove);
  return pts;
}

/**
 * The bets a loan's number is read from: the one just under the line and the one just over it. When the line is
 * below every bet (a healthy loan), the two lowest bets: the estimate is anchored on those. At most `count`.
 */
export function betsAround(ladder, line, count = 2) {
  const pts = [...(ladder ?? [])].sort((a, b) => a.strike - b.strike);
  if (pts.length <= count || !(line > 0)) return pts.slice(0, count);
  let i = pts.findIndex((p) => p.strike >= line);          // first bet at or above the line
  if (i < 0) i = pts.length - 1;
  const start = Math.max(0, Math.min(pts.length - count, i - Math.floor(count / 2)));
  return pts.slice(start, start + count);
}
