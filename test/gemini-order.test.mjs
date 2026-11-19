// The hedge as an order for Gemini's API, and how a private request is signed. No network: the order is built
// from the real ladder saved on Nov 17, 2026, and the signature is checked against one worked out by hand.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { betsFromEvent, hedgeOrder, hedgeQuote } from "../src/hedge.mjs";
import { parseKeepingLongNumbers, readPayload, signedHeaders, wholeNumber } from "../src/gemini-sign.mjs";

const event = JSON.parse(readFileSync(new URL("./fixtures/BTC2611302200.json", import.meta.url), "utf8"));
const bets = betsFromEvent(event);

test("the hedge order buys whole 'No' contracts that cover the loss, at the price asked", () => {
  const quote = hedgeQuote({ bets, line: 51_000, debt: 100_000, lltv: 0.86 });
  const order = hedgeOrder(quote);
  assert.equal(order.symbol, quote.symbol);
  assert.deepEqual([order.orderType, order.side, order.outcome, order.timeInForce], ["limit", "buy", "no", "good-til-cancel"]);
  // a sell-off of 100,000 costs 4.38%: 4,385 one-dollar contracts cover it, 4,384 would not
  assert.equal(order.quantity, String(Math.ceil(quote.loss)));
  assert.ok(Number(order.quantity) >= quote.loss && Number(order.quantity) - 1 < quote.loss);
  // the limit is in whole cents and never under what a "No" costs
  assert.match(order.price, /^0\.\d\d$/);
  assert.ok(Number(order.price) >= quote.price - 1e-9 && Number(order.price) < quote.price + 0.01);
});

test("a small loan still orders one contract, and no quote means no order", () => {
  const small = hedgeOrder(hedgeQuote({ bets, line: 51_000, debt: 12.91, lltv: 0.86 }));
  assert.equal(small.quantity, "1", "Gemini trades whole contracts: the smallest hedge is one");
  assert.equal(hedgeOrder(null), null);
  assert.equal(hedgeOrder(hedgeQuote({ bets: [], line: 51_000, debt: 100, lltv: 0.86 })), null);
  assert.equal(hedgeOrder({ symbol: null, price: 0.2, loss: 5 }), null, "a bet without a symbol cannot be ordered");
  assert.equal(hedgeOrder({ symbol: "X", price: 0.123, loss: 5 }).price, "0.13", "rounded up to the next cent");
  assert.equal(hedgeOrder({ symbol: "X", price: 0.999, loss: 5 }).price, "0.99", "never a dollar or more");
});

test("a private request is signed the way Gemini's docs say", () => {
  const params = { symbol: "GEMI-BTC2611302200-HI57500", orderType: "limit", side: "buy", quantity: "1", price: "0.16", outcome: "no", timeInForce: "good-til-cancel" };
  const h = signedHeaders({ path: "/v1/prediction-markets/order", params, key: "account-test", secret: "test-secret", nonce: 1795000000 });
  // the payload: the request path, the nonce and the order, Base64-encoded
  assert.deepEqual(readPayload(h["X-GEMINI-PAYLOAD"]), { request: "/v1/prediction-markets/order", nonce: 1795000000, ...params });
  // the signature: hex HMAC-SHA384 of that Base64 text with the secret (worked out separately with node:crypto)
  assert.equal(h["X-GEMINI-SIGNATURE"], "a43772c10c674d33e8ae66a0bfa5b5b79b55c1f637b576f6fcdf666f8fef0e1f27a4cfd893d1b49eb7dc855383d4e5b9");
  assert.equal(h["X-GEMINI-SIGNATURE"], createHmac("sha384", "test-secret").update(h["X-GEMINI-PAYLOAD"]).digest("hex"));
  assert.equal(h["X-GEMINI-APIKEY"], "account-test");
  assert.equal(h["Content-Type"], "text/plain");
  // the secret itself is in no header
  for (const v of Object.values(h)) assert.ok(!String(v).includes("test-secret"));
  assert.throws(() => signedHeaders({ path: "/x", key: "", secret: "", nonce: 1 }), /no Gemini key/);
});

test("Gemini's long order numbers are never rounded", () => {
  // our first order on the test site was number 145853902322727140-ish: past what a JavaScript number holds exactly
  const id = "145853902322727143";
  assert.notEqual(String(Number(id)), id, "as a number it would be rounded");
  // from Gemini: kept as text
  const answer = parseKeepingLongNumbers(`{"orderId":${id},"status":"filled","quantity":"1","contractMetadata":{"contractId":"238904-350149"}}`);
  assert.equal(answer.orderId, id);
  assert.equal(answer.status, "filled");
  assert.equal(parseKeepingLongNumbers('{"orderId":12345678,"x":1}').orderId, 12345678, "short numbers stay numbers");
  // to Gemini: written into the signed payload as the bare number, digit for digit
  const h = signedHeaders({ path: "/v1/prediction-markets/order/cancel", params: { orderId: wholeNumber(id) }, key: "account-test", secret: "s", nonce: 1 });
  const sent = Buffer.from(h["X-GEMINI-PAYLOAD"], "base64").toString("utf8");
  assert.equal(sent, `{"request":"/v1/prediction-markets/order/cancel","nonce":1,"orderId":${id}}`);
  assert.throws(() => wholeNumber("12 or 1=1"), /not a whole number/);
});

test("the only host an order can go to is Gemini's test site", () => {
  const src = readFileSync(new URL("../src/gemini-trade.ts", import.meta.url), "utf8");
  const hosts = [...src.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]);
  assert.ok(hosts.length >= 1);
  for (const h of hosts) assert.equal(h, "https://api.sandbox.gemini.com", `gemini-trade.ts must not name ${h}`);
  // and nothing lets a setting or an argument change it
  assert.ok(!/process\.env|config\.[a-zA-Z]*(host|url)/i.test(src), "the host is a constant, not a setting");
});
