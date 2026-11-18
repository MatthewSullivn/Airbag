// The owner's side of the demo, run on the owner's own machine: make the loan risky, or calm it down.
// Use it when the hosted bot only holds the guard's bot key, so its Push / Reset buttons cannot sign for the wallet.
//   npm run demo:push      -> borrow more, down to health PUSH_HEALTH at the live price (capped by Borrow Kit's max)
//   npm run demo:reset     -> repay from the wallet's own USDC back to health RESET_HEALTH
// Signed by PRIVATE_KEY. It never touches the savings: saving the loan is the bot's job.
import { config } from "../src/config.js";
import { LiveArc } from "../src/arc.js";
import { GeminiOdds } from "../src/gemini.js";

const reset = process.argv.includes("--reset");
const arc = new LiveArc({ ...config, useGuard: false });   // the owner's own key, straight through Circle's kits
await arc.init();
const loan = await arc.readLoan();
if (!loan || !loan.debt || !loan.collateral) throw new Error("no open loan for this wallet (run: npm run loan:open)");
const debt = loan.debt, collateral = loan.collateral;

const spot = (await new GeminiOdds([]).spot()).price;
const price = config.priceSource === "real" && spot ? spot : loan.oraclePrice;
if (!price) throw new Error("no BTC price (Gemini is down and the market gave no oracle price)");
const cents = (x: number) => Math.floor(x * 100 + 1e-9) / 100;
const healthAt = (d: number) => ((collateral * price * arc.lltv) / d).toFixed(2);

if (reset) {
  const target = (collateral * price * arc.lltv) / config.resetHealth;
  const wallet = await arc.readWallet();
  const amount = cents(Math.min(debt - target, wallet.usdc - config.gasReserveUsdc));
  if (amount < 0.01) throw new Error(debt - target < 0.01 ? "the loan is already calm" : "not enough USDC in the wallet to reset");
  const move = await arc.repayFromWallet(amount);
  console.log(`reset: repaid ${amount.toFixed(2)} USDC from the wallet. Health ${healthAt(debt)} -> ${healthAt(debt - amount)} at BTC $${Math.round(price)}.`);
  for (const t of move.txs) console.log(`  ${t.label}: ${t.url}`);
} else {
  const target = (collateral * price * arc.lltv) / config.pushHealth;
  const max = await arc.maxDebt();
  const amount = cents(Math.min(target, max != null ? max * 0.995 : target) - debt);
  if (amount < 0.01) throw new Error("the loan is already at the edge (Borrow Kit will not lend more)");
  const move = await arc.borrowMore(amount);
  console.log(`push: borrowed ${amount.toFixed(2)} USDC more. Health ${healthAt(debt)} -> ${healthAt(debt + amount)} at BTC $${Math.round(price)}. Now watch the bot.`);
  for (const t of move.txs) console.log(`  ${t.label}: ${t.url}`);
}
