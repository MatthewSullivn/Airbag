// Deploy AirbagGuard on Arc Testnet and hand it its two narrow powers.
//   cd contracts && forge build && cd ..
//   npm run guard:deploy
//
// Who is who:
//   owner = the wallet in PRIVATE_KEY (the one with the loan and the savings)
//   bot   = a SEPARATE key, GUARD_BOT_KEY. Made here and written to .env if missing. It gets 1 USDC for gas.
// The owner then signs two things, and that is all the guard can ever touch:
//   1. vault.approve(guard, max)          -> the guard may withdraw the owner's savings (only into the owner's loan)
//   2. morpho.setAuthorization(guard, ..) -> the guard may borrow on the owner's loan (only into the owner's savings)
// Undo at any time: approve(guard, 0) and setAuthorization(guard, false), or guard.setPaused(true).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { config } from "../src/config.js";

const ARTIFACT = "contracts/out/AirbagGuard.sol/AirbagGuard.json";
if (!existsSync(ARTIFACT)) throw new Error(`${ARTIFACT} not found. Run: cd contracts && forge build`);
if (!config.privateKey) throw new Error("PRIVATE_KEY missing in .env (the owner: the wallet with the loan and savings)");
if (!config.marketId || !config.vaultAddress) throw new Error("MARKET_ID and VAULT_ADDRESS must be set in .env");
if (/^GUARD_ADDRESS=0x[0-9a-fA-F]{40}\s*$/m.test(readFileSync(".env", "utf8")))
  throw new Error("GUARD_ADDRESS is already set in .env. Remove it first if you really want a second guard.");

const DAILY_CAP_USDC = Number(process.argv[2] ?? 25);
const FLOOR = Number(process.argv[3] ?? 1.15);   // on the lending market's own oracle price

const art = JSON.parse(readFileSync(ARTIFACT, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
const owner = privateKeyToAccount(config.privateKey as Hex);

// The bot key: separate from the owner, written to .env only, never printed.
let env = readFileSync(".env", "utf8");
let botKey = env.match(/^GUARD_BOT_KEY=(0x[0-9a-fA-F]{64})\s*$/m)?.[1] as Hex | undefined;
if (!botKey) {
  botKey = generatePrivateKey();
  env = `${env.trimEnd()}\nGUARD_BOT_KEY=${botKey}\n`;
  writeFileSync(".env", env, { mode: 0o600 });
  console.log("Made a new bot key for the guard (in .env as GUARD_BOT_KEY, not printed).");
}
const bot = privateKeyToAccount(botKey);

const pub = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl) });
const wallet = createWalletClient({ account: owner, chain: arcTestnet, transport: http(config.rpcUrl) });
const link = (h: string) => `${config.explorer}/tx/${h}`;
const wait = async (label: string, hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} failed: ${link(hash)}`);
  console.log(`  ${label}: ${link(hash)}`);
  return r;
};

console.log(`owner ${owner.address}\nbot   ${bot.address}\ncap   ${DAILY_CAP_USDC} USDC/day, give-back floor ${FLOOR}`);

const deploy = await wallet.deployContract({
  abi: art.abi,
  bytecode: art.bytecode.object,
  args: [owner.address, bot.address, config.morphoAddress, config.vaultAddress, config.marketId, parseUnits(String(DAILY_CAP_USDC), 6), parseUnits(String(FLOOR), 18)],
});
const guard = (await wait("deploy", deploy)).contractAddress as Address;

const approve = await wallet.writeContract({
  address: config.vaultAddress as Address,
  abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
  functionName: "approve",
  args: [guard, 2n ** 256n - 1n],
});
await wait("owner lets the guard withdraw savings (vault approve)", approve);

const auth = await wallet.writeContract({
  address: config.morphoAddress as Address,
  abi: parseAbi(["function setAuthorization(address authorized, bool newIsAuthorized)"]),
  functionName: "setAuthorization",
  args: [guard, true],
});
await wait("owner lets the guard borrow on the loan (Morpho authorization)", auth);

const gas = await wallet.sendTransaction({ to: bot.address, value: parseUnits("1", 18) });   // native USDC has 18 decimals
await wait("1 USDC to the bot for gas", gas);

env = readFileSync(".env", "utf8");
env = /^GUARD_ADDRESS=.*$/m.test(env) ? env.replace(/^GUARD_ADDRESS=.*$/m, `GUARD_ADDRESS=${guard}`) : `${env.trimEnd()}\nGUARD_ADDRESS=${guard}\n`;
writeFileSync(".env", env, { mode: 0o600 });

console.log(`\nAirbagGuard: ${config.explorer}/address/${guard}`);
console.log("Written to .env as GUARD_ADDRESS. Next: npm run guard:try -- 0.25");
