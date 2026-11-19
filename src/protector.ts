// Protects MANY loans: every wallet that turned protection on from the page ("Connect wallet").
// Each of those wallets has its own AirbagGuard whose bot key is ours. For each one the same rule runs
// (decide() in brain.mjs), and the ONLY thing this server can do for them is call save() / giveBack()
// on their guard. It holds none of their keys.
//
// It needs no memory of its own: which guards exist, and how much of each owner's savings is inside
// their loan, are both read back from Arc (through the explorer's log API), so a restart loses nothing.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, decodeAbiParameters, formatUnits, http, numberToHex, parseAbi, parseUnits, toEventSelector, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { decide, RULE } from "./brain.mjs";
import { insideLoan, sameContract, type ImmutableRefs } from "./guard-code.mjs";
import { searchBotChanged } from "./guard-search.mjs";
import { oneAtATime } from "./one-at-a-time.mjs";
import { isAddress } from "./wallet-math.mjs";
import { resolveIds, type WalletView } from "./wallet-view.js";
import type { Config } from "./config.js";
import type { GeminiOdds } from "./gemini.js";
import type { Store } from "./state.js";

export const GUARD_ARTIFACT = JSON.parse(readFileSync(new URL("../contracts/AirbagGuard.artifact.json", import.meta.url), "utf8")) as {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
  immutableReferences: ImmutableRefs;
};
/** giveBack() must leave the loan at least this healthy on the lending market's own price. */
export const GUARD_HEALTH_FLOOR = "1.15";

const GUARD_ABI = parseAbi([
  "function save(uint256 assets) returns (uint256 healthAfter)",
  "function giveBack(uint256 assets) returns (uint256 healthAfter)",
  "function owner() view returns (address)",
  "function bot() view returns (address)",
  "function marketId() view returns (bytes32)",
  "function vault() view returns (address)",
  "function paused() view returns (bool)",
  "function capLeft() view returns (uint256)",
  "function dailyCap() view returns (uint256)",
  "error NotOwner()",
  "error NotBot()",
  "error IsPaused()",
  "error ZeroAmount()",
  "error OverDailyCap(uint256 wouldMove, uint256 cap)",
  "error HealthTooLow(uint256 healthAfter, uint256 floor)",
]);
const MORPHO_ABI = parseAbi(["function isAuthorized(address authorizer, address authorized) view returns (bool)"]);
const VAULT_ABI = parseAbi(["function allowance(address owner, address spender) view returns (uint256)"]);
const TOPIC = {
  botChanged: toEventSelector("BotChanged(address)"),
  saved: toEventSelector("Saved(uint256,uint256)"),
  givenBack: toEventSelector("GivenBack(uint256,uint256)"),
};

const COOLDOWN_MS = 8_000;
const DISCOVER_EVERY_MS = 30_000;
const MAX_LOANS = 50;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (x: number | null | undefined) => (x == null ? "n/a" : x < 0.001 && x > 0 ? "<0.1%" : `${+(x * 100).toFixed(1)}%`);
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const cents = (x: number, up = false) => (up ? Math.ceil(x * 100 - 1e-9) : Math.floor(x * 100 + 1e-9)) / 100;
const firstLine = (e: unknown) => String((e as any)?.shortMessage ?? (e as Error)?.message ?? e).split("\n")[0].slice(0, 200);

export interface ProtectedLoan {
  guard: Address;
  owner: Address;
  since: number;
  capUsdc: number;
  /** The owner's savings that are inside the loan right now (saved minus given back), from the guard's own events. */
  inLoan: number;
  lastCheck: number | null;
  lastMove: { t: number; kind: "save" | "give_back"; usdc: number; tx: string } | null;
  lastError: string | null;
  cooldownUntil: number;
}

export class Protector {
  /** The address of our bot key: what a new guard must name as its bot. null when this server has no bot key. */
  readonly botAddress: Address | null = null;
  readonly enabled: boolean;
  botGasUsdc: number | null = null;
  private loans = new Map<string, ProtectedLoan>();   // by guard, lower case
  private client;
  private wallet: ReturnType<typeof createWalletClient> | null = null;
  private account: ReturnType<typeof privateKeyToAccount> | null = null;
  private morpho: Address;
  private marketId: `0x${string}`;
  private vault: Address;
  private fromBlock: number;
  /**
   * One look at every protected loan. Never two at once: both could decide to move the same money. A look that
   * fails (Arc or its explorer not answering) is reported and the next one runs as usual.
   */
  private look = oneAtATime(() => this.tick().catch((e) => console.warn(`[protector] a check failed: ${firstLine(e)}`)));
  private lastDiscover = 0;
  /** The last block the search on Arc itself has covered, and the guards it has seen for our bot key. */
  private searchedTo: number | null = null;
  private seenOnChain = new Set<string>();
  /** The search on Arc has not reached the newest block yet: it carries on at every look, not every 30 s. */
  private catchingUp = true;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private cfg: Config,
    private gemini: GeminiOdds,
    private store: Store,
    private readWalletView: (address: string, opts?: { fresh?: boolean }) => Promise<WalletView>,
    private opts: {
      ids: { marketId: string | null; vault: string | null };
      limit: () => number;
      skipGuard: string | null;
      /** Called after a save or a give-back for a connected wallet (the hedge on Gemini's test site listens). It must not throw. */
      onMove?: (x: { owner: string; kind: "save" | "give_back"; debt: number; line: number; lltv: number; ticker: string | null }) => void;
    },
  ) {
    this.client = createPublicClient({ chain: arcTestnet, transport: http(cfg.rpcUrl) });
    this.morpho = cfg.morphoAddress as Address;
    ({ marketId: this.marketId, vault: this.vault } = resolveIds(opts.ids));
    this.fromBlock = cfg.protectFromBlock;
    const hasKey = /^0x[0-9a-fA-F]{64}$/.test(cfg.guardBotKey);
    if (hasKey) {
      this.account = privateKeyToAccount(cfg.guardBotKey as Hex);
      this.botAddress = this.account.address;
      this.wallet = createWalletClient({ account: this.account, chain: arcTestnet, transport: http(cfg.rpcUrl) });
    }
    this.enabled = cfg.mode === "live" && cfg.protect && hasKey;
  }

  /** Why this server cannot protect wallets, in words for the page. null when it can. */
  why(): string | null {
    if (this.enabled) return null;
    if (this.cfg.mode !== "live") return "This page runs the simulator, which cannot protect real loans. Use the live link.";
    if (!this.botAddress) return "This server has no bot key (GUARD_BOT_KEY), so it cannot act for other wallets.";
    return "Protecting connected wallets is switched off on this server (PROTECT=true turns it on).";
  }

  forOwner(owner: string): ProtectedLoan | null {
    let best: ProtectedLoan | null = null;
    for (const l of this.loans.values()) if (l.owner.toLowerCase() === owner.toLowerCase() && (!best || l.since > best.since)) best = l;
    return best;
  }
  /** The wallets whose loans are being watched (lower case). */
  owners(): string[] {
    return [...this.loans.values()].map((l) => l.owner.toLowerCase());
  }
  summary() {
    return { enabled: this.enabled, why: this.why(), botAddress: this.botAddress, botGasUsdc: this.botGasUsdc, loans: [...this.loans.values()].map((l) => ({ guard: l.guard, owner: l.owner, inLoan: l.inLoan, lastMove: l.lastMove, lastError: l.lastError })) };
  }

  /**
   * Is this address a guard we can trust and use? Checks the code is exactly our build, that it names our bot key,
   * and that it is for our market and vault. Throws with a plain reason otherwise.
   */
  async verify(guard: string): Promise<{ guard: Address; owner: Address; capUsdc: number; active: boolean }> {
    if (!isAddress(guard)) throw new Error("That is not a contract address.");
    if (!this.botAddress) throw new Error(this.why() ?? "no bot key");
    const g = guard as Address;
    if (!sameContract(await this.client.getCode({ address: g }), GUARD_ARTIFACT)) throw new Error("That contract is not an AirbagGuard built from this project.");
    const [owner, bot, market, vault, cap] = await Promise.all([
      this.client.readContract({ address: g, abi: GUARD_ABI, functionName: "owner" }),
      this.client.readContract({ address: g, abi: GUARD_ABI, functionName: "bot" }),
      this.client.readContract({ address: g, abi: GUARD_ABI, functionName: "marketId" }),
      this.client.readContract({ address: g, abi: GUARD_ABI, functionName: "vault" }),
      this.client.readContract({ address: g, abi: GUARD_ABI, functionName: "dailyCap" }),
    ]);
    if (bot.toLowerCase() !== this.botAddress.toLowerCase()) throw new Error("That guard answers to a different bot key, not this server's.");
    if (market.toLowerCase() !== this.marketId.toLowerCase() || vault.toLowerCase() !== this.vault.toLowerCase()) throw new Error("That guard is for a different market or savings vault.");
    // "active" = the owner has given it both permissions. Without them it cannot do anything, so we do not watch it.
    const [authorized, allowance] = await Promise.all([
      this.client.readContract({ address: this.morpho, abi: MORPHO_ABI, functionName: "isAuthorized", args: [owner, g] }),
      this.client.readContract({ address: this.vault, abi: VAULT_ABI, functionName: "allowance", args: [owner, g] }),
    ]);
    return { guard: g, owner, capUsdc: Number(formatUnits(cap, 6)), active: authorized && allowance > 0n };
  }

  /** Start watching a guard (called by the page right after the owner's signatures, and by discovery). */
  async register(guard: string): Promise<ProtectedLoan> {
    if (!this.enabled) throw new Error(this.why() ?? "protection is off");
    const key = guard.toLowerCase();
    if (this.opts.skipGuard && key === this.opts.skipGuard.toLowerCase()) throw new Error("This wallet is already the one this server's main bot protects.");
    const v = await this.verify(guard);
    if (!v.active) throw new Error("The guard does not have both permissions yet (savings and loan). Finish the signatures first.");
    const known = this.loans.get(key);
    if (known) { known.capUsdc = v.capUsdc; return known; }
    if (this.loans.size >= MAX_LOANS) throw new Error("This demo server is already watching as many loans as it can.");
    const loan: ProtectedLoan = { guard: v.guard, owner: v.owner, since: Date.now(), capUsdc: v.capUsdc, inLoan: await this.history(v.guard), lastCheck: null, lastMove: null, lastError: null, cooldownUntil: 0 };
    this.loans.set(key, loan);
    this.store.log("info", `Now protecting wallet ${short(v.owner)} through its guard ${short(v.guard)} (its cap: ${v.capUsdc} USDC a day).`, [{ label: "guard", hash: v.guard, url: `${this.cfg.explorer}/address/${v.guard}` }], v.owner);
    return loan;
  }

  /** Saved minus given back, read from the guard's own events on Arc's explorer. 0 when the explorer cannot say. */
  private async history(guard: Address): Promise<number> {
    try {
      const events: { kind: string; usdc: number }[] = [];
      let url: string | null = `${this.cfg.explorer}/api/v2/addresses/${guard}/logs`;
      for (let page = 0; url && page < 10; page++) {
        const j: any = await (await fetch(url, { signal: AbortSignal.timeout(12_000) })).json();
        for (const l of j.items ?? []) {
          const t0 = String(l.topics?.[0] ?? "").toLowerCase();
          if (t0 !== TOPIC.saved && t0 !== TOPIC.givenBack) continue;
          const [assets] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], l.data as Hex);
          events.push({ kind: t0 === TOPIC.saved ? "saved" : "givenBack", usdc: Number(formatUnits(assets, 6)) });
        }
        url = j.next_page_params ? `${this.cfg.explorer}/api/v2/addresses/${guard}/logs?${new URLSearchParams(j.next_page_params).toString()}` : null;
      }
      return insideLoan(events);
    } catch {
      return 0;
    }
  }

  /**
   * The same search as discover() below, asked of Arc itself instead of its explorer (src/guard-search.mjs says
   * why). The first pass covers every block since `fromBlock`; later passes only the new blocks. A guard seen
   * once is looked at again on every pass until it is being watched, because its owner may give it its two
   * permissions later.
   */
  private async discoverOnChain() {
    if (!this.botAddress) return;
    const me = this.botAddress.toLowerCase();
    const latest = Number(await this.client.getBlockNumber());
    const from = this.searchedTo == null ? this.fromBlock : this.searchedTo + 1;
    if (from <= latest) {
      const r = await searchBotChanged({
        from,
        to: latest,
        pause: 150,
        getLogs: (a, b) => this.client.request({ method: "eth_getLogs", params: [{ fromBlock: numberToHex(a), toBlock: numberToHex(b), topics: [TOPIC.botChanged] }] }),
      });
      if (r.scannedTo >= from) this.searchedTo = r.scannedTo;
      this.catchingUp = r.scannedTo < latest;
      for (const f of r.found) if (f.bot === me) this.seenOnChain.add(f.guard);
      if (r.error) console.warn(`[protector] the search on Arc stopped at block ${r.scannedTo}: ${r.error}`);
    }
    for (const guard of this.seenOnChain) {
      if (this.loans.has(guard) || (this.opts.skipGuard && guard === this.opts.skipGuard.toLowerCase())) continue;
      try {
        if ((await this.verify(guard)).active) await this.register(guard);
      } catch { /* not a guard of ours, or not ready yet: look again next time */ }
    }
  }

  /** Find guards made for our bot key since `fromBlock`: each guard announces its bot key in a BotChanged event when it is created. */
  private async discover() {
    if (!this.botAddress) return;
    const url = `${this.cfg.explorer}/api?module=logs&action=getLogs&fromBlock=${this.fromBlock}&toBlock=latest&topic0=${TOPIC.botChanged}`;
    const j: any = await (await fetch(url, { signal: AbortSignal.timeout(15_000) })).json();
    for (const l of Array.isArray(j.result) ? j.result : []) {
      try {
        const [bot] = decodeAbiParameters([{ type: "address" }], l.data as Hex);
        const guard = String(l.address).toLowerCase();
        if (bot.toLowerCase() !== this.botAddress.toLowerCase() || this.loans.has(guard)) continue;
        if (this.opts.skipGuard && guard === this.opts.skipGuard.toLowerCase()) continue;
        if ((await this.verify(guard)).active) await this.register(guard);
      } catch { /* not a guard of ours, or not ready yet: ignore */ }
    }
  }

  start() {
    if (!this.enabled) return;
    this.store.log("info", `Protecting connected wallets is on. Bot key ${this.botAddress}.`);
    this.timer = setInterval(() => void this.look(), Math.max(5, this.cfg.tickSeconds * 2) * 1000);
    void this.look();
  }
  /**
   * Something just happened in our lending market: a QuickNode Stream delivery, already checked against Arc by
   * the server. Look at every protected loan now instead of waiting for the next timer tick. If a look is under
   * way, one more follows it, because that one may have read the chain before the change landed.
   */
  wake() {
    if (this.enabled) void this.look(true);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Started only through `look`, which makes sure one runs at a time. */
  private async tick() {
    const due = Date.now() - this.lastDiscover > DISCOVER_EVERY_MS;
    // Arc itself first: it is what the bot can always reach. After a restart it has many blocks to go through,
    // a few thousand per look, so until it has caught up it carries on at every look.
    if (due || this.catchingUp) await this.discoverOnChain().catch((e) => console.warn(`[protector] could not search Arc for guards: ${firstLine(e)}`));
    if (due) {
      this.lastDiscover = Date.now();
      // then the explorer, as before
      await this.discover().catch((e) => console.warn(`[protector] could not search for guards: ${firstLine(e)}`));
      this.botGasUsdc = Number(formatUnits(await this.client.getBalance({ address: this.botAddress! }), 18));
      if (this.botGasUsdc < 0.05) console.warn(`[protector] the bot key is nearly out of gas (${this.botGasUsdc} USDC). Send USDC to ${this.botAddress}.`);
    }
    for (const loan of [...this.loans.values()]) {
      try {
        await this.check(loan);
        loan.lastError = null;
      } catch (e) {
        const message = firstLine(e);
        if (loan.lastError !== message) this.store.log("error", `Protected wallet ${short(loan.owner)}: ${message}`, undefined, loan.owner);
        loan.lastError = message;
      }
    }
  }

  private async check(loan: ProtectedLoan) {
    const v = await this.readWalletView(loan.owner, { fresh: true });
    loan.lastCheck = Date.now();
    if (!v.loan) return;                                      // the owner closed the loan: nothing to protect
    if (Date.now() < loan.cooldownUntil) return;
    const odds = await this.gemini.get();
    const oddsAt = odds.events.length ? odds.oddsAt : () => null;   // Gemini down: health rule only
    const limit = this.opts.limit();
    const d = decide({ debt: v.loan.debt, collateral: v.loan.collateral, btcPrice: v.loan.priceUsed, lltv: v.market.lltv }, null, v.savings, loan.inLoan, limit, { oddsAt });
    const who = `Protected wallet ${short(loan.owner)}`;
    if (d.action === "repay") {
      const amount = Math.min(cents(d.repay, true), cents(v.savings), v.loan.debt);
      const why = d.odds != null && d.odds > limit ? `odds hit ${pct(d.odds)} (limit ${pct(limit)})` : `health fell to ${d.health.toFixed(2)} (the rule acts under ${RULE.actBelowHealth.toFixed(2)})`;
      const moved = await this.move(loan, "save", amount, `${who}: ${why}. Moved {amount} USDC from its savings into its loan. Line was ${usd(d.line)}.`);
      if (moved > 0) this.tell(loan.owner, "save", v.loan.debt - moved, v.loan.collateral, v.market.lltv, odds.detail(d.line)?.ticker ?? null);
    } else if (d.action === "give_back") {
      const moved = await this.move(loan, "giveBack", cents(d.borrow), `${who}: calm again (odds ${pct(d.odds)}, health ${d.health.toFixed(2)}). Gave {amount} USDC back to its savings.`);
      if (moved > 0) this.tell(loan.owner, "give_back", v.loan.debt + moved, v.loan.collateral, v.market.lltv, null);
    } else if (d.action === "out_of_savings") {
      throw new Error("in danger, but its savings pot is empty");
    }
  }

  private tell(owner: string, kind: "save" | "give_back", debt: number, collateral: number, lltv: number, ticker: string | null) {
    try { this.opts.onMove?.({ owner, kind, debt, line: debt / (collateral * lltv), lltv, ticker }); } catch { /* an extra: never part of the move */ }
  }

  /** One transaction on the owner's guard, signed by our bot key. Never more than that guard's on-chain cap still allows. Returns what it moved (0 = nothing sent). */
  private async move(loan: ProtectedLoan, fn: "save" | "giveBack", wanted: number, text: string): Promise<number> {
    if (!this.wallet || !this.account) return 0;
    const left = Number(formatUnits(await this.client.readContract({ address: loan.guard, abi: GUARD_ABI, functionName: "capLeft" }), 6));
    const amount = cents(Math.min(wanted, left));
    if (amount < 0.01) {
      if (wanted >= 0.01) throw new Error(`its guard's daily cap is used up (${left.toFixed(2)} USDC left today)`);
      return 0;
    }
    if (this.cfg.dryRun) {
      this.store.log("action", `${text.replace("{amount}", amount.toFixed(2)).replace("Moved", "Would move").replace("Gave", "Would give")} (dry run)`, undefined, loan.owner);
      loan.cooldownUntil = Date.now() + COOLDOWN_MS;
      return 0;
    }
    // simulate first: a refusal (cap, health floor, paused, permission revoked) shows its reason and costs no gas
    const { request } = await this.client.simulateContract({ account: this.account, address: loan.guard, abi: GUARD_ABI, functionName: fn, args: [parseUnits(amount.toFixed(6), 6)] });
    const hash = await this.wallet.writeContract(request);
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`its guard rejected the ${fn} (${hash})`);
    loan.inLoan = Math.max(0, Math.round((loan.inLoan + (fn === "save" ? amount : -amount)) * 1e6) / 1e6);
    loan.lastMove = { t: Date.now(), kind: fn === "save" ? "save" : "give_back", usdc: amount, tx: hash };
    loan.cooldownUntil = Date.now() + COOLDOWN_MS;
    this.store.log("action", text.replace("{amount}", amount.toFixed(2)), [{ label: fn === "save" ? "save through its guard" : "give back through its guard", hash, url: `${this.cfg.explorer}/tx/${hash}` }], loan.owner);
    return amount;
  }

  /** Stop watching a guard whose owner took its permissions away. */
  async refresh(guard: string): Promise<boolean> {
    const key = guard.toLowerCase();
    const loan = this.loans.get(key);
    if (!loan) return false;
    const v = await this.verify(guard);
    if (v.active) return true;
    this.loans.delete(key);
    this.store.log("info", `Stopped protecting wallet ${short(loan.owner)}: it took its guard's permissions away.`, undefined, loan.owner);
    return false;
  }
}
