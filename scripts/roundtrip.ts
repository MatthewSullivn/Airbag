// M2: the savings round trip, with no human input, using the exact functions the bot uses:
//   savings -> withdraw -> repay the loan   (arc.moveSavingsIntoLoan)
//   borrow back -> deposit into savings      (arc.giveBack)
//   npm run roundtrip                 -> moves 0.25 USDC
//   npm run roundtrip -- 0.5          -> moves 0.5 USDC
import { config } from "../src/config.js";
import { LiveArc, type LoanView } from "../src/arc.js";

const amount = Number(process.argv[2] ?? 0.25);
const arc = new LiveArc(config);
await arc.init();

async function ready(): Promise<LoanView> {
  for (let i = 0; i < 60; i++) {
    const l = await arc.readLoan();
    if (!l) throw new Error("no open loan: run npm run loan:open first");
    if (l.dataStatus === "READY") return l;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("loan data stayed PENDING for 60 s");
}
const show = (tag: string, l: LoanView, s: { balance: number } | null) =>
  console.log(`${tag.padEnd(18)} debt ${l.debt?.toFixed(6)} USDC | health ${l.healthFactor?.toFixed(4)} (${l.band}) | line $${l.liquidationPrice?.toFixed(0)} | savings ${s?.balance.toFixed(6)} USDC`);

let savings = await arc.readSavings();
if (!savings) throw new Error("no Earn vault found");
if (savings.balance < amount) {
  const w = await arc.readWallet();
  const top = Math.min(Math.max(amount * 4, 1), w.usdc - config.gasReserveUsdc);
  if (top < amount) throw new Error(`savings has ${savings.balance} USDC and the wallet only ${w.usdc}: get USDC from the faucet first`);
  console.log(`savings has ${savings.balance} USDC, depositing ${top.toFixed(2)} from the wallet first...`);
  const d = await arc.depositToSavings(top);
  console.log(`  deposited ${d.amount}  ${d.txs.map((t) => t.url).join(" ")}`);
  savings = await arc.readSavings();
}

show("before", await ready(), savings);

let t = Date.now();
const save = await arc.moveSavingsIntoLoan(amount);
console.log(`\nwithdraw + repay ${save.amount} USDC took ${((Date.now() - t) / 1000).toFixed(1)} s`);
for (const x of save.txs) console.log(`  ${x.label}: ${x.url}`);
t = Date.now();
const afterSave = await ready();
console.log(`  (Borrow Kit data READY again after ${((Date.now() - t) / 1000).toFixed(1)} s)`);
show("after the save", afterSave, await arc.readSavings());

t = Date.now();
const back = await arc.giveBack(save.amount);
console.log(`\nborrow + deposit ${back.amount} USDC took ${((Date.now() - t) / 1000).toFixed(1)} s`);
for (const x of back.txs) console.log(`  ${x.label}: ${x.url}`);
show("after give-back", await ready(), await arc.readSavings());
console.log("\nM2 done: withdraw -> repay -> borrow -> deposit ran with no human input.");
