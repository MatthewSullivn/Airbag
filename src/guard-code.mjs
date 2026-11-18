// Pure helpers for recognising an AirbagGuard on-chain and reading its history. No dependencies.

/**
 * Zero out the per-deployment values inside runtime bytecode (owner, market, vault ... are baked in as
 * "immutables"), so two deployments of the same contract compare equal. refs = { id: [{ start, length }] } in bytes.
 */
export function maskImmutables(codeHex, refs) {
  const chars = String(codeHex ?? "").toLowerCase().replace(/^0x/, "").split("");
  for (const list of Object.values(refs || {}))
    for (const { start, length } of list)
      for (let i = start * 2; i < (start + length) * 2 && i < chars.length; i++) chars[i] = "0";
  return chars.join("");
}

/** true when the code at an address is exactly our build of the contract. Anything else is not trusted as a guard. */
export function sameContract(onChainCode, artifact) {
  if (!onChainCode || onChainCode === "0x") return false;
  const a = maskImmutables(onChainCode, artifact.immutableReferences);
  const b = maskImmutables(artifact.deployedBytecode, artifact.immutableReferences);
  return a.length > 0 && a === b;
}

/**
 * How much of the owner's savings is inside the loan right now, from the guard's own events:
 * everything it saved, minus everything it gave back. events = [{ kind: "saved" | "givenBack", usdc }].
 */
export function insideLoan(events) {
  let sum = 0;
  for (const e of events || []) sum += e.kind === "saved" ? e.usdc : e.kind === "givenBack" ? -e.usdc : 0;
  return Math.max(0, Math.round(sum * 1e6) / 1e6);
}
