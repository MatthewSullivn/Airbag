// The server checks QuickNode deliveries against real receipts (src/stream-verify.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeReceipt, isTxHash } from "../src/stream-verify.mjs";

const WALLET = "0xF6B5177872Fc12DCBcE76d023e96988fB7Fa3F0C";
const MARKET = "0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58";
const ids = { wallet: WALLET, marketId: MARKET };
const pad = (a) => "0x000000000000000000000000" + a.slice(2).toLowerCase();
const MORPHO = "0x65f435eb4ff05f1481618694bc1ff7ee4680c0a4";
const BATCHER = "0x522faf9a91c41c443c66765030741e4aace147d0";
const REPAY = "0x52acb05cebbd3cd39715469f22afbf5a17496295ef3bc9bb5944056c63ccaa09";
const LIQUIDATE = "0xa4946ede45d0c6f06a0f5ce92c9ad3b4751452d2fe0e25010783bcab57a67e41";
const OTHER = "0x2222222222222222222222222222222222222222";

test("our live repay (shape of tx 0x1b566cce…, block 72746520) is recognised", () => {
  const receipt = { from: WALLET.toLowerCase(), to: BATCHER, logs: [{ address: MORPHO, topics: [REPAY, MARKET, pad(BATCHER), pad(WALLET)] }] };
  assert.deepEqual(describeReceipt(receipt, ids), { kind: "our loan: repay", detail: "Morpho 0x65f435eb" });
});

test("someone else's activity in our market is labelled as market activity", () => {
  const receipt = { from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [REPAY, MARKET, pad(OTHER), pad(OTHER)] }] };
  assert.equal(describeReceipt(receipt, ids).kind, "market: repay");
});

test("a liquidation of our loan is flagged; a fake label can't create one", () => {
  const ours = { from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [LIQUIDATE, MARKET, pad(OTHER), pad(WALLET)] }] };
  assert.equal(describeReceipt(ours, ids).kind, "our loan: OUR LOAN LIQUIDATED");
});

test("a bot wallet transaction without market events is still ours", () => {
  assert.equal(describeReceipt({ from: WALLET, to: OTHER, logs: [] }, ids).kind, "bot wallet transaction");
});

test("unrelated transactions and other markets are dropped", () => {
  assert.equal(describeReceipt({ from: OTHER, to: OTHER, logs: [] }, ids), null);
  const otherMarket = "0x" + "ab".repeat(32);
  assert.equal(describeReceipt({ from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [REPAY, otherMarket, pad(OTHER)] }] }, ids), null);
  assert.equal(describeReceipt(null, ids), null);
});

test("only real transaction hashes are looked up", () => {
  assert.equal(isTxHash("0x1b566cce68a7247928a296dba45b6b32ef78e210ba5ebeff863ebabe885c37dc"), true);
  assert.equal(isTxHash("0x1234"), false);
  assert.equal(isTxHash(42), false);
});
