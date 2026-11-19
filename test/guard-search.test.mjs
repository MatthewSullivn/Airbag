// The search for guards on Arc itself (src/guard-search.mjs). The event data and block numbers below are the
// real ones of the two guards made for our bot key, read from Arc Testnet on Nov 19, 2026.
import test from "node:test";
import assert from "node:assert/strict";
import { blockRanges, botIn, searchBotChanged, MAX_BLOCKS_PER_SEARCH } from "../src/guard-search.mjs";

const BOT = "0x2294967d938b87f43d469afc24ac4cde2117cc69";
const DATA = "0x0000000000000000000000002294967d938b87f43d469afc24ac4cde2117cc69";
const hex = (n) => "0x" + n.toString(16);
const REAL = [
  { address: "0x895fa892dc4ff752ec9114760201f4751c106bf3", data: DATA, blockNumber: hex(72_815_142) },
  { address: "0xC7AE194fc194f54f999df6cb44c3199264d768f7", data: DATA, blockNumber: hex(72_828_696) },
];
const blockOf = (l) => parseInt(l.blockNumber, 16);
/** A chain that holds the two real events and refuses a search over too many blocks, as Arc's RPC does. */
const chain = (calls = []) => async (a, b) => {
  calls.push([a, b]);
  if (b - a + 1 > MAX_BLOCKS_PER_SEARCH) throw new Error("requested range too large");
  return REAL.filter((l) => blockOf(l) >= a && blockOf(l) <= b);
};

test("ranges cover every block once, in pieces Arc accepts", () => {
  const r = blockRanges(72_800_000, 72_812_345);
  assert.deepEqual(r, [[72_800_000, 72_804_999], [72_805_000, 72_809_999], [72_810_000, 72_812_345]]);
  assert.deepEqual(blockRanges(10, 10), [[10, 10]]);
  assert.deepEqual(blockRanges(11, 10), []);
  assert.deepEqual(blockRanges(0, 9, 5), [[0, 4], [5, 9]]);
});

test("the bot key is read from the event's data, and nothing else passes as one", () => {
  assert.equal(botIn(DATA), BOT);
  assert.equal(botIn("0x"), null);
  assert.equal(botIn(DATA.slice(0, -2)), null);
  assert.equal(botIn("0x" + "f".repeat(64)), null, "32 bytes that are not a padded address");
  assert.equal(botIn(undefined), null);
});

test("it finds both real guards between the start block and now", async () => {
  const calls = [];
  const r = await searchBotChanged({ getLogs: chain(calls), from: 72_800_000, to: 72_935_439, maxRanges: 100 });
  assert.equal(r.error, null);
  assert.equal(r.scannedTo, 72_935_439);
  assert.deepEqual(r.found, [
    { guard: "0x895fa892dc4ff752ec9114760201f4751c106bf3", bot: BOT, block: 72_815_142 },
    { guard: "0xc7ae194fc194f54f999df6cb44c3199264d768f7", bot: BOT, block: 72_828_696 },
  ]);
  assert.ok(calls.every(([a, b]) => b - a + 1 <= MAX_BLOCKS_PER_SEARCH), "no search was wider than Arc allows");
  assert.equal(calls.length, 28);
});

test("a later pass only looks at the new blocks", async () => {
  const calls = [];
  const r = await searchBotChanged({ getLogs: chain(calls), from: 72_935_440, to: 72_935_500 });
  assert.deepEqual(calls, [[72_935_440, 72_935_500]]);
  assert.deepEqual(r.found, []);
  assert.equal(r.scannedTo, 72_935_500);
});

test("a range that fails stops the pass there, so the next pass tries it again and nothing is skipped", async () => {
  let n = 0;
  const flaky = async (a, b) => {
    n++;
    if (a === 72_810_000) throw new Error("Arc did not answer\nstack");
    return REAL.filter((l) => blockOf(l) >= a && blockOf(l) <= b);
  };
  const r = await searchBotChanged({ getLogs: flaky, from: 72_800_000, to: 72_935_439, together: 4 });
  assert.equal(r.error, "Arc did not answer");
  assert.equal(r.scannedTo, 72_809_999, "the block before the range that failed");
  assert.deepEqual(r.found, [], "the guard in a later range of the same batch is not reported yet: it comes with the retry");
  assert.equal(n, 4, "it stopped after the batch that failed");
});

test("nothing answered at all leaves the search where it was", async () => {
  const r = await searchBotChanged({ getLogs: async () => { throw new Error("down"); }, from: 500, to: 900 });
  assert.equal(r.scannedTo, 499);
  assert.equal(r.error, "down");
});

test("one pass asks for ten ranges at most, one at a time, and the next pass carries on from there", async () => {
  const calls = [];
  let open = 0, most = 0;
  const counted = async (a, b) => { open++; most = Math.max(most, open); try { return await chain(calls)(a, b); } finally { open--; } };
  const first = await searchBotChanged({ getLogs: counted, from: 72_800_000, to: 73_800_000 });
  assert.equal(calls.length, 10);
  assert.equal(most, 1, "never two searches at once");
  assert.equal(first.scannedTo, 72_849_999);
  assert.equal(first.found.length, 2, "both guards are in the first ten ranges");
  const second = await searchBotChanged({ getLogs: counted, from: first.scannedTo + 1, to: 73_800_000 });
  assert.equal(calls.length, 20);
  assert.equal(calls[10][0], 72_850_000);
  assert.equal(second.scannedTo, 72_899_999);
});

test("logs that are not a guard's announcement are ignored", async () => {
  const junk = async () => [{ address: "not an address", data: DATA }, { address: REAL[0].address, data: "0x1234" }, null, REAL[1]];
  const r = await searchBotChanged({ getLogs: junk, from: 1, to: 2 });
  assert.deepEqual(r.found.map((f) => f.guard), ["0xc7ae194fc194f54f999df6cb44c3199264d768f7"]);
});
