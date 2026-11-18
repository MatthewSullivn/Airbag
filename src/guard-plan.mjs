// Small pure helpers for running the bot through AirbagGuard (contracts/). No dependencies, so
// they are easy to test, like brain.mjs.

const isKey = (x) => typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x);
const isAddress = (x) => typeof x === "string" && /^0x[0-9a-fA-F]{40}$/.test(x);

/** Why this key setup cannot run, or null when it can. Never includes a key in the message. */
export function guardSetupProblem({ useGuard, guardAddress, guardBotKey, privateKey }) {
  if (useGuard) {
    if (!isAddress(guardAddress) || !isKey(guardBotKey)) return "USE_GUARD=true needs GUARD_ADDRESS and GUARD_BOT_KEY in .env (run: npm run guard:deploy)";
    if (privateKey && !isKey(privateKey)) return "PRIVATE_KEY is malformed in .env (leave it empty to run without the wallet's own key)";
    if (isKey(privateKey) && privateKey.toLowerCase() === guardBotKey.toLowerCase()) return "GUARD_BOT_KEY must be a different key from PRIVATE_KEY";
    return null;
  }
  return isKey(privateKey) ? null : "PRIVATE_KEY missing or malformed in .env (run: npm run wallet:new)";
}

/** The amount the guard will still accept today, or null when less than a cent is left. */
export function clampToGuardCap(amount, capLeft) {
  const a = Math.min(amount, capLeft);
  return a >= 0.01 ? a : null;
}
