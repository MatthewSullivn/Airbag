// Live proof for AirbagGuard: the BOT key (not the owner) runs one save and one give-back through the guard.
//   npm run guard:try -- 0.25
// Then it shows that a stranger is refused, and prints every transaction link for the README.
// Moves real testnet money on the owner's loan: don't run it while a live `npm start` bot uses the same wallet.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { USDC, config } from "../src/config.js";

const env = readFileSync(".env", "utf8");
const guard = env.match(/^GUARD_ADDRESS=(0x[0-9a-fA-F]{40})\s*$/m)?.[1] as Address | undefined;
const botKey = env.match(/^GUARD_BOT_KEY=(0x[0-9a-fA-F]{64})\s*$/m)?.[1] as Hex | undefined;
if (!guard || !botKey) throw new Error("GUARD_ADDRESS / GUARD_BOT_KEY missing: run npm run guard:deploy first");

const amount = parseUnits(String(Number(process.argv[2] ?? 0.25)), 6);
const { abi } = JSON.parse(readFileSync("contracts/out/AirbagGuard.sol/AirbagGuard.json", "utf8")) as { abi: Abi };
const bot = privateKeyToAccount(botKey);
const owner = privateKeyToAccount(config.privateKey as Hex).address;
const pub = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl) });
const botWallet = createWalletClient({ account: bot, chain: arcTestnet, transport: http(config.rpcUrl) });
const link = (h: string) => `${config.explorer}/tx/${h}`;
const read = (functionName: string) => pub.readContract({ address: guard, abi, functionName }) as Promise<bigint>;
const usdcOf = (a: Address) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [a] });
const h = (x: bigint) => (x > 10n ** 30n ? "no debt" : (Number(x) / 1e18).toFixed(3));

console.log(`guard ${guard}\nowner ${owner}\nbot   ${bot.address}`);
console.log(`health before: ${h(await read("health"))}   cap left today: ${formatUnits(await read("capLeft"), 6)} USDC`);
const botUsdcBefore = await usdcOf(bot.address);

for (const fn of ["save", "giveBack"] as const) {
  const t0 = Date.now();
  const hash = await botWallet.writeContract({ address: guard, abi, functionName: fn, args: [amount] });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${fn} failed: ${link(hash)}`);
  console.log(`${fn}(${formatUnits(amount, 6)} USDC) by the bot in ${((Date.now() - t0) / 1000).toFixed(1)} s, health now ${h(await read("health"))}: ${link(hash)}`);
}

// The bot paid only gas: it received nothing.
const botUsdcAfter = await usdcOf(bot.address);
console.log(`bot USDC ${formatUnits(botUsdcBefore, 6)} -> ${formatUnits(botUsdcAfter, 6)} (only gas spent, nothing received)`);

// A stranger can't use the guard (simulated, so it costs nothing).
const stranger = privateKeyToAccount(generatePrivateKey());
try {
  await pub.simulateContract({ account: stranger, address: guard, abi, functionName: "save", args: [amount] });
  console.log("UNEXPECTED: a stranger's save() would have gone through");
  process.exitCode = 1;
} catch (e) {
  const msg = (e as Error).message;
  console.log(`stranger's save() refused: ${/NotBot/.test(msg) ? "NotBot (only the bot key may call it)" : msg.split("\n")[0]}`);
}
