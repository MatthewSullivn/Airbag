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

test("a connected wallet's push and Airbag's save for it are told apart from strangers", () => {
  const BORROW = "0x570954540bed6b1304a87dfe815a5eda4a648f7097a16240dcd85c9b5fd42a43";
  const OWNER = "0x5364A92e3e1a18190dFeC35ba03a74e8fd31Fb53", GUARD = "0xc7ae194fc194f54f999df6cb44c3199264d768f7";
  const watching = { ...ids, connected: [OWNER] };
  // the push of Nov 19 (tx 0x1ebff1e8…): Borrow(id, onBehalf, receiver)
  const push = { from: OWNER.toLowerCase(), to: MORPHO, logs: [{ address: MORPHO, topics: [BORROW, MARKET, pad(OWNER), pad(OWNER)] }] };
  assert.equal(describeReceipt(push, watching).kind, "connected wallet: borrow");
  // the save through its guard (tx 0xe902da78…): Repay(id, caller = the guard, onBehalf = the owner)
  const save = { from: OTHER, to: GUARD, logs: [{ address: MORPHO, topics: [REPAY, MARKET, pad(GUARD), pad(OWNER)] }] };
  assert.equal(describeReceipt(save, watching).kind, "connected wallet: repay");
  // the same transactions, when nobody connected is being watched, are just the market's
  assert.equal(describeReceipt(push, ids).kind, "market: borrow");
  // a stranger stays a stranger
  const stranger = { from: OTHER, to: MORPHO, logs: [{ address: MORPHO, topics: [BORROW, MARKET, pad(OTHER), pad(OTHER)] }] };
  assert.equal(describeReceipt(stranger, watching).kind, "market: borrow");
  // and our own loan keeps its label even if its wallet is also on the list
  const ours = { from: WALLET, to: MORPHO, logs: [{ address: MORPHO, topics: [REPAY, MARKET, pad(WALLET), pad(WALLET)] }] };
  assert.equal(describeReceipt(ours, { ...ids, connected: [WALLET] }).kind, "our loan: repay");
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
