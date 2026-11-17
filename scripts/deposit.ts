// Put wallet USDC into the savings pot (Earn Kit vault).   npm run savings:deposit -- 5
import { config } from "../src/config.js";
import { LiveArc } from "../src/arc.js";

const amount = Number(process.argv[2]);
if (!(amount > 0)) throw new Error("usage: npm run savings:deposit -- <USDC amount>");
const arc = new LiveArc(config);
await arc.init();
const w = await arc.readWallet();
if (w.usdc - amount < config.gasReserveUsdc) throw new Error(`wallet has ${w.usdc} USDC; keep at least ${config.gasReserveUsdc} for gas`);
const d = await arc.depositToSavings(amount);
console.log(`deposited ${d.amount} USDC into ${arc.vault?.name}`, d.txs.map((t) => t.url).join(" "));
console.log("savings now:", await arc.readSavings());
