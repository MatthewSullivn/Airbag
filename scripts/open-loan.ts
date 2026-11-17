// M1: open the loan with Circle's Borrow Kit on Arc Testnet.
//   npm run loan:open                 -> borrow so health is 1.40 at the live BTC price
//   npm run loan:open -- 1.6          -> pick another starting health
// Uses all the cirBTC in the bot wallet as collateral. Prints the loan and the contracts it touched.
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, http, keccak256, toHex } from "viem";
import { arcTestnet } from "viem/chains";
import { config } from "../src/config.js";
import { LiveArc, usdc6 } from "../src/arc.js";
import { GeminiOdds } from "../src/gemini.js";

const startHealth = Number(process.argv[2] ?? 1.4);
const kit = new AppKit();
const arc = new LiveArc(config);
await arc.init();
const from = { adapter: createViemAdapterFromPrivateKey({ privateKey: config.privateKey }), chain: config.chain };

if (arc.loanId) {
  console.log(`This wallet already has an open loan: ${arc.loanId} (one loan per wallet per market).`);
  console.log(await arc.readLoan());
  process.exit(0);
}

const wallet = await arc.readWallet();
console.log(`wallet ${wallet.address}: ${wallet.usdc} USDC, ${wallet.cirbtc} cirBTC`);
if (!(wallet.cirbtc > 0)) throw new Error("no cirBTC in the wallet yet: request it at https://faucet.circle.com (Arc Testnet)");
if (!(wallet.usdc > 0.05)) throw new Error("no USDC for gas yet: request USDC at https://faucet.circle.com (Arc Testnet)");

const spot = (await new GeminiOdds([]).spot()).price;
if (!spot) throw new Error("could not read the BTC price from Gemini");
const max = await kit.borrow.getMaxBorrow({ chain: config.chain, marketId: arc.marketId!, collateralAmount: String(wallet.cirbtc) });
const wanted = (wallet.cirbtc * spot * arc.lltv) / startHealth;
const borrowAmount = Math.min(wanted, Number(max.maxBorrowAmount.amount) * 0.99);
console.log(`BTC $${spot}. Borrowing ${usdc6(borrowAmount)} USDC against ${wallet.cirbtc} cirBTC (health ${startHealth} at the live price; Borrow Kit max is ${max.maxBorrowAmount.amount}).`);

const res: any = await kit.borrow.borrow({ from, marketId: arc.marketId!, borrowAmount: usdc6(borrowAmount) });
console.dir(res, { depth: 4 });
const loanId: string = res.loanId;
console.log(`\nloanId ${loanId}   tx ${config.explorer}/tx/${res.txHash}`);

// wait for Borrow Kit to finish indexing the new loan
let pos: any;
for (let i = 0; i < 60; i++) {
  pos = await kit.borrow.getPosition({ loanId });
  if (pos.dataStatus === "READY") break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("\nposition:");
console.dir(pos, { depth: 4 });

// if the kit only took part of the cirBTC, post the rest so the loan uses all of it
const after = await arc.readWallet();
if (after.cirbtc > 0) {
  console.log(`\nadding the remaining ${after.cirbtc} cirBTC as collateral...`);
  const add: any = await kit.borrow.addCollateral({ from, loanId, collateralAmount: String(after.cirbtc) });
  console.log(`added ${add.collateralAdded?.amount ?? after.cirbtc} cirBTC   tx ${config.explorer}/tx/${add.txHash}`);
}

// which contracts emitted events (the lending market contract is the one QuickNode should watch)
if (res.txHash) {
  const client = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: res.txHash });
  const BORROW = keccak256(toHex("Borrow(bytes32,address,address,address,uint256,uint256)"));
  console.log("\ncontracts that emitted events in the borrow tx:");
  for (const log of receipt.logs) {
    const tag = log.topics[0] === BORROW ? "  <- Morpho Blue Borrow event (use this address in stream/filter.js)" : "";
    console.log(`  ${log.address}  topic0 ${log.topics[0]?.slice(0, 10)}…${tag}`);
  }
}
console.log(`\nPut LOAN_ID=${loanId} in .env (optional; the bot also finds it by itself).`);
