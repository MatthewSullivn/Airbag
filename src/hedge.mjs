// A hedge QUOTE for the loan, from Gemini's own prices. Pure logic, no dependencies (like brain.mjs), so the
// server, the page and the tests all use the same functions. Nothing here places an order.
//
// The idea: Gemini sells "No" on bets like "$57,500 or above on Nov 30". A "No" pays 1 dollar if bitcoin ends
// BELOW that price. So the market that prices the danger also sells protection against it.

/**
 * How much extra a sell-off takes. Morpho Blue's rule: liquidators receive the debt's worth of collateral times
 * 1 / (1 - 0.3 × (1 - LLTV)), at most 1.15. For the Arc market (LLTV 0.86) that is 1.0438: a 4.4% penalty.
 */
export const selloffFactor = (lltv) => Math.min(1.15, 1 / (1 - 0.3 * (1 - lltv)));

const num = (x) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);

/** Gemini event JSON -> each "$X or above" bet with what it costs to buy each side right now, lowest price first. */
export function betsFromEvent(event) {
  return (event?.contracts ?? [])
    .filter((c) => (!c.strike?.type || c.strike.type === "above") && c.strike?.value != null)
    .map((c) => ({
      strike: Number(c.strike.value),
      buyYes: num(c.prices?.buy?.yes),
      buyNo: num(c.prices?.buy?.no),
      symbol: typeof c.instrumentSymbol === "string" ? c.instrumentSymbol : null,
    }))
    .filter((b) => Number.isFinite(b.strike))
    .sort((a, b) => a.strike - b.strike);
}

/**
 * The quote. Picks the lowest bet at or above the loan's line, so it pays in every case where bitcoin ENDS below
 * the line. Returns null when no such bet has a usable price.
 *   loss = what being sold off would cost: the penalty share of the debt
 *   cost = what covering that loss costs today: loss × the price of one "No"
 * Left out on purpose, and the page says so: Gemini's fees, and the fact that a "No" pays on the end date only
 * (a dip that takes the loan and then recovers pays nothing).
 */
/**
 * The quote as an order for Gemini's POST /v1/prediction-markets/order: buy enough "No" to cover the loss.
 * One "No" pays one dollar, so that is the loss in whole contracts, rounded up (at least one). The limit price is
 * the price asked, in whole cents and never under it. null when there is no quote or no symbol to order.
 * The page shows this order; with a sandbox key the bot places it on Gemini's test site (src/hedger.ts).
 */
export function hedgeOrder(quote) {
  if (!quote || !quote.symbol || !(quote.price > 0) || !(quote.price < 1) || !(quote.loss > 0)) return null;
  const contracts = Math.max(1, Math.ceil(quote.loss - 1e-9));
  const price = Math.min(0.99, Math.ceil(quote.price * 100 - 1e-9) / 100);
  return { symbol: quote.symbol, orderType: "limit", side: "buy", outcome: "no", quantity: String(contracts), price: price.toFixed(2), timeInForce: "good-til-cancel" };
}

export function hedgeQuote({ bets, line, debt, lltv }) {
  if (!(line > 0) || !(debt > 0)) return null;
  const bet = (bets ?? []).find((b) => b.strike >= line && b.buyNo != null && b.buyNo > 0 && b.buyNo < 1);
  if (!bet) return null;
  const penaltyShare = selloffFactor(lltv) - 1;
  const loss = debt * penaltyShare;
  return { strike: bet.strike, symbol: bet.symbol, price: bet.buyNo, penaltyShare, loss, cost: loss * bet.buyNo };
}
