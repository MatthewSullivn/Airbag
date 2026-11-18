// Recognising a real AirbagGuard on-chain, and rebuilding "savings inside the loan" from its events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maskImmutables, sameContract, insideLoan } from "../src/guard-code.mjs";

const artifact = JSON.parse(readFileSync(new URL("../contracts/AirbagGuard.artifact.json", import.meta.url), "utf8"));

// what a deployment looks like: the same runtime code with real values written into the immutable slots
function deployed(fill) {
  const chars = artifact.deployedBytecode.slice(2).split("");
  for (const list of Object.values(artifact.immutableReferences))
    for (const { start, length } of list)
      for (let i = start * 2; i < (start + length) * 2; i++) chars[i] = fill;
  return "0x" + chars.join("");
}

test("the committed artifact is complete", () => {
  assert.ok(artifact.bytecode.startsWith("0x") && artifact.bytecode.length > 1000);
  assert.ok(artifact.deployedBytecode.length > 1000);
  assert.ok(Object.keys(artifact.immutableReferences).length >= 5, "owner, morpho, vault, marketId, usdc");
  for (const name of ["save", "giveBack", "owner", "bot", "capLeft", "setLimits", "setPaused"]) assert.ok(artifact.abi.some((x) => x.name === name), name);
});

test("two deployments of our contract are recognised, whatever owner and market they were made for", () => {
  assert.equal(sameContract(deployed("a"), artifact), true);
  assert.equal(sameContract(deployed("7"), artifact), true);
  assert.equal(sameContract(deployed("a").toUpperCase().replace("0X", "0x"), artifact), true);
});

test("anything else is not trusted as a guard", () => {
  assert.equal(sameContract("0x", artifact), false);
  assert.equal(sameContract(null, artifact), false);
  assert.equal(sameContract("0x6080604052", artifact), false);
  // one byte of logic changed, outside the immutable slots
  const real = deployed("a");
  const at = 2 + 400;
  const tampered = real.slice(0, at) + (real[at] === "f" ? "0" : "f") + real.slice(at + 1);
  const inSlot = Object.values(artifact.immutableReferences).flat().some(({ start, length }) => (at - 2) / 2 >= start && (at - 2) / 2 < start + length);
  assert.equal(inSlot, false, "the test must flip a byte of logic");
  assert.equal(sameContract(tampered, artifact), false);
  // code with something appended
  assert.equal(sameContract(real + "00", artifact), false);
});

test("masking only touches the immutable slots", () => {
  const masked = maskImmutables(deployed("a"), artifact.immutableReferences);
  assert.equal(masked, maskImmutables(artifact.deployedBytecode, artifact.immutableReferences));
  assert.equal(masked.length, artifact.deployedBytecode.length - 2);
});

test("savings inside the loan = saved minus given back, never below zero", () => {
  assert.equal(insideLoan([]), 0);
  // the first guard's real history on Arc Testnet: three saves, two give-backs
  assert.equal(insideLoan([{ kind: "saved", usdc: 0.25 }, { kind: "givenBack", usdc: 0.25 }, { kind: "saved", usdc: 0.25 }, { kind: "givenBack", usdc: 0.25 }, { kind: "saved", usdc: 3.67 }]), 3.67);
  assert.equal(insideLoan([{ kind: "givenBack", usdc: 5 }]), 0);
  assert.equal(insideLoan([{ kind: "saved", usdc: 1.1 }, { kind: "saved", usdc: 2.2 }, { kind: "other", usdc: 9 }]), 3.3);
});
