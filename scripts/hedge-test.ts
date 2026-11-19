// Try the hedge on Gemini's TEST site, by hand. Test money only: src/gemini-trade.ts reaches nothing else.
//
//   npm run hedge:test                      what would be ordered, and whether this account may trade (sends nothing)
//   npm run hedge:test -- --accept-terms    accept Gemini's prediction market terms for this test account (your decision)
//   npm run hedge:test -- --send            place that one order on the test site, then list what is open
//   npm run hedge:test -- --cancel 12345    cancel an order
//   npm run hedge:test -- --cancel-all      cancel every open prediction market order of this test account
//   npm run hedge:test -- --orders          this test account's filled orders and the contracts it holds
//
// Needs GEMINI_SANDBOX_KEY and GEMINI_SANDBOX_SECRET in .env (a key with the Trader role from
// https://exchange.sandbox.gemini.com/settings/api). Neither is ever printed.
import { config } from "../src/config.js";
import { GeminiSandbox } from "../src/gemini-trade.js";
import { betsFromEvent, hedgeOrder, hedgeQuote } from "../src/hedge.mjs";
import { LLTV } from "../src/brain.mjs";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const sandbox = new GeminiSandbox(config.geminiSandboxKey, config.geminiSandboxSecret);
if (!sandbox.enabled) {
  console.log("No sandbox key yet. Add these two lines to .env (from https://exchange.sandbox.gemini.com/settings/api, role Trader):\n  GEMINI_SANDBOX_KEY=account-...\n  GEMINI_SANDBOX_SECRET=...");
  process.exit(1);
}

try {
  if (has("--cancel-all")) {
    const open = await sandbox.activeOrders();
    for (const o of open) console.log(`cancel ${o.orderId} (${o.symbol}):`, (await sandbox.cancelOrder(o.orderId)).result);
    console.log(open.length ? "done" : "nothing was open");
    process.exit(0);
  }
  if (has("--orders")) {
    const filled = await sandbox.orderHistory();
    console.log(filled.length ? "Filled orders, newest first:" : "No filled orders.");
    for (const o of filled) console.log(`  ${o.orderId}  ${o.side} ${o.filledQuantity ?? o.quantity} "${o.outcome}" on ${o.symbol} at ${o.avgExecutionPrice ?? o.price}  (${o.createdAt ?? ""})`);
    const held = await sandbox.positions();
    console.log(held.length ? "Contracts held:" : "No contracts held.");
    for (const p of held) console.log(`  ${p.totalQuantity} "${p.outcome}" on ${p.symbol}, bought at ${p.avgPrice} on average`);
    process.exit(0);
  }
  const cancelAt = args.indexOf("--cancel");
  if (cancelAt >= 0) {
    console.log(await sandbox.cancelOrder(args[cancelAt + 1]));
    process.exit(0);
  }

  // 1. may this account trade prediction markets?
  let terms = await sandbox.termsStatus();
  console.log(`Gemini's prediction market terms: ${terms.hasAcceptedLatest ? "accepted" : "NOT accepted yet"} (accepted version ${terms.acceptedVersion ?? "none"}, latest ${terms.latestVersion ?? "?"})`);
  if (!terms.hasAcceptedLatest && has("--accept-terms")) {
    console.log("Accepting them for this test account, as you asked:", await sandbox.acceptTerms());
    terms = await sandbox.termsStatus();
  }
  if (!terms.hasAcceptedLatest) console.log("Orders are refused until they are accepted. Read them on the test site (Predictions), then run:  npm run hedge:test -- --accept-terms");

  // 2. the order: the hedge for a sample loan of 20 USDC at health 1.25, priced from the REAL market's live prices
  const ticker = config.geminiTickers[0] ?? "BTC2611302200";
  const [event, spot] = await Promise.all([
    fetch(`https://api.gemini.com/v1/prediction-markets/events/${ticker}`).then((r) => r.json()),
    fetch("https://api.gemini.com/v1/pubticker/btcusd").then((r) => r.json()).then((t) => Number(t.last)),
  ]);
  const line = spot / 1.25;
  // the test site lists fewer bets than the real one: the order must be for one it has
  const listed = await sandbox.listed(ticker);
  const real = betsFromEvent(event);
  const bets = real.filter((b) => b.symbol && listed.has(b.symbol.toUpperCase()));
  console.log(`\nBets of ${ticker}: ${real.length} on the real site, ${bets.length} of them on the test site (from $${bets[0]?.strike.toLocaleString("en-US") ?? "?"}).`);
  const quote = hedgeQuote({ bets, line, debt: 20, lltv: LLTV });
  const order = hedgeOrder(quote);
  if (!quote || !order) throw new Error(`no bet of ${ticker} at or above $${Math.round(line)} that the test site lists has a price right now`);
  console.log(`\nA loan of 20 USDC that is lost below $${Math.round(line).toLocaleString("en-US")} (bitcoin is at $${Math.round(spot).toLocaleString("en-US")}):`);
  console.log(`  a sell-off would cost ${quote.loss.toFixed(2)} USDC. The hedge:`);
  console.log(" ", JSON.stringify(order));

  if (!has("--send")) {
    console.log("\nNothing was sent. To place this order on the test site:  npm run hedge:test -- --send");
    process.exit(0);
  }
  if (!terms.hasAcceptedLatest) throw new Error("the terms are not accepted, so the order would be refused");

  // 3. place it, and show what is open
  const placed = await sandbox.placeOrder(order);
  console.log(`\nPlaced on Gemini's test site: order ${placed.orderId}, status ${placed.status}, ${placed.filledQuantity ?? "0"} of ${placed.quantity} filled.`);
  const open = await sandbox.activeOrders(order.symbol);
  console.log(`Open orders on ${order.symbol}: ${open.map((o) => `${o.orderId} (${o.side} ${o.quantity} ${o.outcome} at ${o.price}, ${o.status})`).join(", ") || "none"}`);
  console.log(`To cancel it:  npm run hedge:test -- --cancel ${placed.orderId}`);
} catch (e) {
  console.error(`\nIt did not work: ${(e as Error).message}`);
  process.exit(1);
}
