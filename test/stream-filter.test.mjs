// The QuickNode filter is a plain script (no imports/exports), exactly as pasted into QuickNode.
// Load it the same way QuickNode does and feed it fake "Block with Receipts" batches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../stream/filter.js", import.meta.url), "utf8");
const main = new Function(`${src}\nreturn main;`)();

const WALLET = "0xf6b5177872fc12dcbce76d023e96988fb7fa3f0c";
const pad = (a) => "0x000000000000000000000000" + a.slice(2).toLowerCase();
const MARKET = "0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58";
const MORPHO = "0x1111111111111111111111111111111111111111";
const BORROW = "0x570954540bed6b1304a87dfe815a5eda4a648f7097a16240dcd85c9b5fd42a43";
const LIQUIDATE = "0xa4946ede45d0c6f06a0f5ce92c9ad3b4751452d2fe0e25010783bcab57a67e41";
const OTHER = "0x2222222222222222222222222222222222222222";

const batch = (receipts) => ({ data: [{ block: { number: "0x45a" }, receipts }] });

test("ignores blocks with nothing about the loan", () => {
  assert.equal(main(batch([{ transactionHash: "0x01", from: OTHER, to: OTHER, logs: [{ address: OTHER, topics: ["0xdead"] }] }])), null);
  assert.equal(main({ data: [] }), null);
});

test("our borrow in the market is matched and labelled", () => {
  const out = main(batch([{ transactionHash: "0xaa", from: WALLET, to: MORPHO, logs: [{ address: MORPHO, topics: [BORROW, MARKET, pad(WALLET), pad(WALLET)] }] }]));
  assert.equal(out.matches.length, 1);
  assert.equal(out.matches[0].kind, "our loan: borrow");
  assert.equal(out.matches[0].block, 0x45a);
  assert.equal(out.matches[0].tx, "0xaa");
});

test("someone else's activity in the same market is matched too", () => {
  const out = main(batch([{ transactionHash: "0xbb", from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [BORROW, MARKET, pad(OTHER), pad(OTHER)] }] }]));
  assert.equal(out.matches[0].kind, "market: borrow");
});

test("a liquidation of our loan is flagged loudly", () => {
  const out = main(batch([{ transactionHash: "0xcc", from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [LIQUIDATE, MARKET, pad(OTHER), pad(WALLET)] }] }]));
  assert.equal(out.matches[0].kind, "our loan: OUR LOAN LIQUIDATED");
});

test("a plain transfer from the bot wallet is matched", () => {
  const out = main(batch([{ transactionHash: "0xdd", from: WALLET, to: OTHER, logs: [] }]));
  assert.equal(out.matches[0].kind, "bot wallet transaction");
});

test("other markets are ignored", () => {
  const other = "0x" + "ab".repeat(32);
  assert.equal(main(batch([{ transactionHash: "0xee", from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [BORROW, other, pad(OTHER), pad(OTHER)] }] }])), null);
});
