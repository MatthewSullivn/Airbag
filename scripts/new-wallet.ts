// M0: make a brand-new, testnet-only bot wallet and write it into .env.
//   npm run wallet:new
// The private key is written to .env only. It is never printed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV = ".env";
const existing = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
if (/^PRIVATE_KEY=0x[0-9a-fA-F]{64}\s*$/m.test(existing)) {
  const addr = existing.match(/^BOT_ADDRESS=(.*)$/m)?.[1]?.trim();
  console.log(`.env already has a PRIVATE_KEY${addr ? ` (address ${addr})` : ""}. Not touching it.`);
  process.exit(0);
}

const key = generatePrivateKey();
const address = privateKeyToAccount(key).address;
const secret = randomBytes(18).toString("hex");

const set = (text: string, name: string, value: string) =>
  new RegExp(`^${name}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`)
    : `${text.trimEnd()}\n${name}=${value}\n`;

let env = existing || readFileSync(".env.example", "utf8");
env = set(env, "PRIVATE_KEY", key);
env = set(env, "BOT_ADDRESS", address);
if (!/^WEBHOOK_SECRET=\S+/m.test(env)) env = set(env, "WEBHOOK_SECRET", secret);
writeFileSync(ENV, env, { mode: 0o600 });

console.log("New bot wallet written to .env (the key is in .env only, never commit it).");
console.log(`Address: ${address}`);
console.log("Next: open https://faucet.circle.com, pick Arc Testnet, and request cirBTC and USDC to that address.");
console.log(`Explorer: https://explorer.testnet.arc.io/address/${address}`);
