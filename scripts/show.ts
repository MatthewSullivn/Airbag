// Print everything about the bot's loan, savings and wallet.   npm run loan:show
import { config } from "../src/config.js";
import { LiveArc } from "../src/arc.js";

const arc = new LiveArc(config);
await arc.init();
console.log(`market ${arc.marketId}  lltv ${arc.lltv}`);
console.log(`vault  ${arc.vault?.address}  ${arc.vault?.name}  apy ${arc.vault?.apy}`);
console.log("wallet", await arc.readWallet());
console.log("savings", await arc.readSavings());
const loan = await arc.readLoan();
console.log("loan", loan);
if (loan) console.log("Borrow Kit max total debt for this collateral:", await arc.maxDebt());
