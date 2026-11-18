// (Not in a folder called data/: the repo ignores every data/ folder, and this file must be committed.)
// What really happened on Arc Testnet, copied from README "Live proof". Nothing here is made up or simulated:
// every step is a transaction anyone can open on the explorer. The page replays these runs for visitors
// who have no wallet, and labels them as recorded.
export const EXPLORER = "https://explorer.testnet.arc.io";
/** Where the live bot is hosted (a real loan on Arc Testnet). The simulator points visitors here for the parts it cannot do. */
export const LIVE_URL = "https://airbagged.me";
/** The always-on simulator: a simulated loan anyone can push, with the market's real odds. */
export const SIM_URL = "https://airbag-demo.onrender.com";

/** Public addresses the project uses on Arc Testnet (AGENTS.md "Key facts"). */
export const ADDRESSES = {
  morpho: "0x65f435eb4ff05f1481618694bc1ff7ee4680c0a4",
  marketId: "0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58",
  oracle: "0x917E3d9F366B0561c13155BECdBC8d79E4ED7BA3",
  vault: "0xaabbef1d3971c710276ed41ec791bbe14cdb8e88",
  cirbtc: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  usdc: "0x3600000000000000000000000000000000000000",
  /** The guard the hosted bot signs through (deployed Nov 18, 2026). */
  guard: "0x895fa892dc4ff752ec9114760201f4751c106bf3",
  /** The guard a visitor's wallet created from the page (Nov 18, 2026). */
  visitorGuard: "0xc7ae194fc194f54f999df6cb44c3199264d768f7",
  /** The bot's own key. It can only call save() and giveBack() on guards that name it. */
  botKey: "0x2294967D938B87f43D469AFC24AC4CDe2117cC69",
} as const;

/**
 * Gas each kind of transaction really used on Arc Testnet (from the explorer, Nov 18, 2026), with the transaction
 * it was read from. Arc charges gas in USDC, so gas used × the gas price is the fee in dollars.
 */
export const GAS = {
  createGuard: { gas: 1_321_433, tx: "0xad739863144719ab56c3ef56ee65e3b49533e6cce5d60add66292f244536d10d" },
  savingsPermission: { gas: 46_272, tx: "0xb5cc14ea6cba9287c8667ccfbc0b6a7aa3896dc61856720aefc28794c695926f" },
  loanPermission: { gas: 47_250, tx: "0xff3bf81bc72b30162c3c2bd15d8e3e2725dc929d068af06b31ec6f3bb00a4567" },
  save: { gas: 387_296, tx: "0xbc9bd6ca82f6d36e04976c9d66067c9c1b8e5616af92d6a7458da90663db46f2" },
  giveBack: { gas: 363_141, tx: "0xe2a3b40c9cb2f6c6e432838ddcf749b4e3e785df3a19fda2ba1102aa3ff6005a" },
} as const;
/** The price those transactions paid: 25 gwei of USDC per unit of gas. */
export const TESTNET_GAS_PRICE_WEI = 25_000_000_000;

export interface ReplayStep {
  /** Seconds since the run started. */
  at: number;
  /** Clock time, UTC, as the block says. */
  utc: string;
  who: "you" | "bot";
  title: string;
  detail: string;
  tx: string;
  /** State of the loan after this step. */
  debt: number;
  health: number;
  line: number;
  /** Odds the bot read at this moment, where it was recorded. */
  odds?: number;
  /** USDC of gas the transaction cost, where it was recorded. */
  gas?: number;
  /** The step in one or two plain sentences, for the replay. Every figure in it is one of the recorded ones. */
  say: string;
}

/**
 * Nov 18, 2026: a visitor's wallet (0x5364…Fb53) protected through its own AirbagGuard, every step clicked on
 * the page at airbagged.me. The loan: 0.0003 cirBTC locked, market LLTV 0.86, bitcoin at about $64,650.
 * Health and line follow from the on-chain amounts: line = debt / (0.0003 × 0.86), health = price / line.
 */
export const VISITOR_RUN = {
  date: "2026-11-18",
  wallet: "0x5364A92e3e1a18190dFeC35ba03a74e8fd31Fb53",
  guard: ADDRESSES.visitorGuard,
  collateral: 0.0003,
  btc: 64_650,
  limit: 0.05,
  start: { utc: "09:36:00", debt: 11.9, health: 1.4, line: 46_124, say: "Bitcoin is at $64,650. This loan loses its bitcoin below $46,124." },
  steps: [
    { at: 8, utc: "09:36:08", who: "you", title: "The loan is pushed to the edge", detail: "Borrowed 3.83 USDC more. Bitcoin only had to fall 5.7% to reach the line.", tx: "0x2b3d6fb178c8f838e9ed1d300900f38cdf644d4c40c18f1870e6ca5ff8aab877", debt: 15.73, health: 1.06, line: 60_969, odds: 0.419, say: "The owner borrows $3.83 more. Airbag reads a 41.9% chance of losing the bitcoin. Its limit is 5%." },
    { at: 11, utc: "09:36:11", who: "bot", title: "Airbag saves it", detail: "Moved 2.39 USDC of the wallet's own savings into its loan, through the wallet's guard.", tx: "0xbc9bd6ca82f6d36e04976c9d66067c9c1b8e5616af92d6a7458da90663db46f2", debt: 13.34, health: 1.25, line: 51_705, gas: 0.0097, say: "Airbag moves $2.39 of the owner's savings into the loan. The fee: one cent." },
    { at: 37, utc: "09:36:37", who: "you", title: "The owner calms the loan", detail: "Repaid 2.22 USDC from the wallet.", tx: "0x17e8147929d440f40b875c953bc953e79848de29e7d4041a751082abed1fe1c5", debt: 11.12, health: 1.5, line: 43_100, say: "The owner pays $2.22 back." },
    { at: 41, utc: "09:36:41", who: "bot", title: "Airbag gives the savings back", detail: "Borrowed 1.70 USDC back into savings and stopped at health 1.30.", tx: "0xe2a3b40c9cb2f6c6e432838ddcf749b4e3e785df3a19fda2ba1102aa3ff6005a", debt: 12.82, health: 1.3, line: 49_690, gas: 0.0091, say: "Calm again, so Airbag moves $1.70 back to savings." },
  ] satisfies ReplayStep[],
  setup: [
    { label: "lock 0.0003 cirBTC", tx: "0x3e26bac2afdc77df4bc219029b5f2767eba0ecb9b79438e3b436e1061339846c" },
    { label: "borrow 11.90 USDC", tx: "0xe677aa6be02a816856fc309848fae7cb7484bcd0930b7b114690f382fbbe2f06" },
    { label: "put 10 USDC in savings", tx: "0x22f42077abc315c3adc20748d901ffc54b693f6842ee4119151247fb24c23f61" },
    { label: "create the guard", tx: "0xad739863144719ab56c3ef56ee65e3b49533e6cce5d60add66292f244536d10d" },
    { label: "savings permission", tx: "0xb5cc14ea6cba9287c8667ccfbc0b6a7aa3896dc61856720aefc28794c695926f" },
    { label: "loan permission", tx: "0xff3bf81bc72b30162c3c2bd15d8e3e2725dc929d068af06b31ec6f3bb00a4567" },
  ],
} as const;

/**
 * Nov 17, 2026: the QuickNode Stream `airbag-arc-testnet` delivered these four transactions of a savings round
 * trip as they happened, and each delivery woke the bot (README "QuickNode Stream"). The kinds are the labels the
 * server gave them; the times and hashes are the blocks' own, read from Arc's explorer.
 */
export const STREAM_RUN = {
  date: "Nov 17, 2026",
  deliveries: [
    { utc: "23:04:45", block: 72_754_872, kind: "bot wallet transaction", what: "Savings withdrawn", tx: "0x8cb2c68961f8fb5157ebddabaca5cfdc3333589678e80494b42c6050e49e3b7b" },
    { utc: "23:04:49", block: 72_754_880, kind: "our loan: repay", what: "Loan repaid", tx: "0x0ac18a1cf4027a79e4452248b4928e9c193fdbaf5f763ca821ed0c7a39fd03a8" },
    { utc: "23:04:53", block: 72_754_888, kind: "our loan: borrow", what: "Borrowed back", tx: "0x1b1a1c512e9c5a32747eed342316b2805f5e1512c27209880fd0f9ba9718b8c7" },
    { utc: "23:04:56", block: 72_754_893, kind: "bot wallet transaction", what: "Savings deposited", tx: "0x3c042b864ac819ac6b64a9bb57b0ff42ffc6899e9cec2522001e9c526af248bb" },
  ],
} as const;

/** The other recorded saves, as one-line facts with their links (README "Live proof"). */
export const OTHER_SAVES = [
  {
    when: "Nov 18, 2026 · 07:54:54 UTC",
    what: "The hosted bot holds no wallet key. It read the odds at 33.9% and moved 3.67 USDC through AirbagGuard, 4 s after the push. Odds after: 0.4%. Gas: 0.0058 USDC.",
    push: "0xfb0f0bd3985f4668dfb4ffdc7b425424a12405ade8f772a9de416f55a9f51b67",
    save: "0xdf46b72ca61bea169fafb07a50f100c95cd98c4285c56d88e0f645f502165630",
  },
  {
    when: "Nov 17, 2026 · 21:53:59 UTC",
    what: "The first save. Odds went from 42% to 0.8% in 4 s: 0.78 USDC from savings into the loan. Two transactions, 0.0154 USDC of gas.",
    push: "0xb82f1377894d3fdab3882e34057ab8465c7fad8323360baae170823458eef69e",
    save: "0x1b566cce68a7247928a296dba45b6b32ef78e210ba5ebeff863ebabe885c37dc",
  },
] as const;
