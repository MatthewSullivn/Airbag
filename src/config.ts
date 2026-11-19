// All settings come from .env (see .env.example). Nothing secret is ever sent to the browser.

const str = (name: string, fallback = ""): string => (process.env[name] ?? "").trim() || fallback;
const num = (name: string, fallback: number): number => {
  const raw = str(name);
  if (raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
};
const list = (name: string): string[] => str(name).split(",").map((s) => s.trim()).filter(Boolean);

const simFlag = process.argv.includes("--sim") || str("AIRBAG_MODE") === "sim";

export const config = {
  /** "live" talks to Arc Testnet through Circle's kits. "sim" fakes the Arc side in memory (Gemini stays live). */
  mode: (simFlag ? "sim" : "live") as "live" | "sim",
  privateKey: str("PRIVATE_KEY"),
  botAddress: str("BOT_ADDRESS"),
  /** AirbagGuard (contracts/). true = saves and give-backs go through the guard, signed by GUARD_BOT_KEY, and PRIVATE_KEY becomes optional. */
  useGuard: str("USE_GUARD") === "true",
  guardAddress: str("GUARD_ADDRESS"),
  guardBotKey: str("GUARD_BOT_KEY"),
  /** true = also protect every wallet that turned protection on from the page (each has its own guard for GUARD_BOT_KEY). One server per bot key. */
  protect: str("PROTECT") === "true",
  /** Where the search for guards starts on Arc Testnet (just before the first AirbagGuard was deployed). */
  protectFromBlock: num("PROTECT_FROM_BLOCK", 72_800_000),

  limit: num("USER_LIMIT", 0.05),
  dailyCapUsdc: num("DAILY_CAP_USDC", 25),
  tickSeconds: Math.max(2, num("TICK_SECONDS", 5)),
  gasReserveUsdc: num("GAS_RESERVE_USDC", 0.5),
  dryRun: str("DRY_RUN") === "true",

  geminiTickers: list("GEMINI_TICKERS"),
  /** Listen to Gemini's live feed and wake the bot when a bet's price moves (src/gemini-feed.ts). false = only read every 20 s. */
  geminiFeed: str("GEMINI_FEED") !== "false",
  /** "real" = value the cirBTC at Gemini's live BTC price (what mainnet's oracle would say). "oracle" = the lending market's own price. */
  priceSource: (str("PRICE_SOURCE", "real") === "oracle" ? "oracle" : "real") as "real" | "oracle",

  chain: "Arc_Testnet" as const,
  rpcUrl: str("ARC_RPC_URL", "https://rpc.testnet.arc.io"),
  explorer: "https://explorer.testnet.arc.io",
  marketId: str("MARKET_ID"),
  /** Morpho Blue on Arc Testnet (found in our first borrow's receipt). The bot reads the loan from it directly. Empty = Borrow Kit only. */
  morphoAddress: str("MORPHO_ADDRESS", "0x65f435eb4ff05f1481618694bc1ff7ee4680c0a4"),
  vaultAddress: str("VAULT_ADDRESS"),
  loanId: str("LOAN_ID"),
  circleApiKey: str("CIRCLE_API_KEY"),

  port: num("PORT", 3000),
  publicUrl: str("PUBLIC_URL").replace(/\/+$/, ""),
  webhookSecret: str("WEBHOOK_SECRET"),
  /** Hosted simulator only: anyone can press Push / Reset / Limit without the key. Ignored in live mode (see src/public-demo.mjs). */
  publicDemoFlag: str("PUBLIC_DEMO"),

  /** Demo buttons: "push it to the edge" borrows until this health (on the real BTC price), capped by Borrow Kit's max. */
  pushHealth: num("PUSH_HEALTH", 1.06),
  /** Demo "reset" repays from the wallet until this health. */
  resetHealth: num("RESET_HEALTH", 1.5),
};

export type Config = typeof config;

export const USDC = "0x3600000000000000000000000000000000000000" as const;   // ERC-20 view of native USDC, 6 decimals
export const CIRBTC = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as const; // Circle Wrapped Bitcoin, 8 decimals
// Arc Testnet defaults for the read-only wallet lookup (the live bot finds its own market and vault through Circle's kits).
export const ARC_TESTNET_MARKET = "0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58" as const; // Borrow Kit cirBTC/USDC market (Morpho id)
export const ARC_TESTNET_VAULT = "0xaabbef1d3971c710276ed41ec791bbe14cdb8e88" as const;                             // EarnKit USDC Vault
