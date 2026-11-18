// Owner only: show or change AirbagGuard's on-chain limits.
//   npm run guard:limits                 -> show the current limits (read-only)
//   npm run guard:limits -- 200          -> cap 200 USDC a day, keep the health floor
//   npm run guard:limits -- 200 1.15     -> set the cap and the give-back health floor
// Changing them is one transaction, signed by PRIVATE_KEY (the guard's owner). The bot key cannot do this.
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { config } from "../src/config.js";

if (!/^0x[0-9a-fA-F]{40}$/.test(config.guardAddress)) throw new Error("GUARD_ADDRESS missing in .env (run: npm run guard:deploy)");
const guard = config.guardAddress as Address;
const abi = parseAbi([
  "function owner() view returns (address)",
  "function dailyCap() view returns (uint256)",
  "function minHealthAfterGiveBack() view returns (uint256)",
  "function capLeft() view returns (uint256)",
  "function setLimits(uint256 dailyCap_, uint256 minHealthAfterGiveBack_)",
]);
const pub = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl) });
const read = (functionName: "dailyCap" | "minHealthAfterGiveBack" | "capLeft") => pub.readContract({ address: guard, abi, functionName });

const show = async (tag: string) => {
  const [cap, floor, left] = await Promise.all([read("dailyCap"), read("minHealthAfterGiveBack"), read("capLeft")]);
  console.log(`${tag}: cap ${formatUnits(cap, 6)} USDC a day (${formatUnits(left, 6)} left today), give-back health floor ${formatUnits(floor, 18)}`);
  return { cap, floor };
};

console.log(`guard ${guard}`);
const before = await show("now");
const capArg = process.argv[2];
if (capArg == null) process.exit(0);

const cap = Number(capArg);
const floor = process.argv[3] != null ? Number(process.argv[3]) : Number(formatUnits(before.floor, 18));
if (!(cap > 0) || !(floor >= 1)) throw new Error("usage: npm run guard:limits -- <cap in USDC> [health floor, 1 or more]");
if (!/^0x[0-9a-fA-F]{64}$/.test(config.privateKey)) throw new Error("PRIVATE_KEY (the guard's owner) is needed to change the limits");
const owner = privateKeyToAccount(config.privateKey as Hex);
const onChainOwner = await pub.readContract({ address: guard, abi, functionName: "owner" });
if (onChainOwner.toLowerCase() !== owner.address.toLowerCase()) throw new Error(`PRIVATE_KEY is not this guard's owner (its owner is ${onChainOwner})`);

const wallet = createWalletClient({ account: owner, chain: arcTestnet, transport: http(config.rpcUrl) });
const hash = await wallet.writeContract({ address: guard, abi, functionName: "setLimits", args: [parseUnits(String(cap), 6), parseUnits(String(floor), 18)] });
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`setLimits failed: ${config.explorer}/tx/${hash}`);
console.log(`changed: ${config.explorer}/tx/${hash}`);
await show("after");
