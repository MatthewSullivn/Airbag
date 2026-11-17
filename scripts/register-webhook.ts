// M6: ask Borrow Kit to call our server when the loan's health band changes.
//   npm run webhook:register             -> registers  $PUBLIC_URL/api/borrow-webhook?key=$WEBHOOK_SECRET
//   npm run webhook:register -- --remove -> removes it
// The wallet signs the registration (no transaction). PUBLIC_URL must be reachable from the internet.
import { config } from "../src/config.js";
import { LiveArc } from "../src/arc.js";

const remove = process.argv.includes("--remove");
if (!remove && !config.publicUrl) throw new Error("set PUBLIC_URL in .env (your deployed server, or an ngrok/cloudflared tunnel)");
const arc = new LiveArc(config);
await arc.init();
const url = remove ? null : `${config.publicUrl}/api/borrow-webhook${config.webhookSecret ? `?key=${encodeURIComponent(config.webhookSecret)}` : ""}`;
const result = await arc.registerWebhook(url);
console.log(remove ? "webhook removed" : `webhook registered for loan ${arc.loanId}: ${result.replace(/key=[^&]+/, "key=***")}`);
