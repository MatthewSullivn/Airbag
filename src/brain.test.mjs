// The plan's original check for the brain (section 11). Run with: node src/brain.test.mjs
// More checks live in test/brain.extra.test.mjs.
import assert from "node:assert/strict";
import { ladderFromEvent, chanceBelow, oddsLoanDies, decide } from "./brain.mjs";
const q = [[61000,.82,.86],[61500,.80,.84],[62000,.76,.80],[62500,.72,.76],[63000,.67,.71]];
const L = ladderFromEvent({ contracts: q.map(([s,b,a]) => ({ label: `$${s} or above`, prices: { bestBid: b, bestAsk: a } })) });
assert.ok(Math.abs(chanceBelow(L, 61000) - 0.16) < 1e-9);
assert.ok(Math.abs(oddsLoanDies(L, 61000) - 0.32) < 1e-9);
assert.equal(chanceBelow(L, 50000), null);
const col = 0.0001, debt = 62000 * col * 0.86;
const r = decide({ debt, collateral: col, btcPrice: 64470 }, L, 3, 0, 0.05);
assert.equal(r.action, "repay"); assert.ok(Math.abs(r.repay - 0.8965) < 1e-3);
console.log("ok");
