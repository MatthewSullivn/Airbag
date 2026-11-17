// The bot. It never stops:
//   1. something wakes it (timer, Borrow Kit webhook, QuickNode Stream, a demo button)
//   2. it reads the loan + savings from Arc and the odds + BTC price from Gemini
//   3. it runs the rule (decide() in brain.mjs)
//   4. repay from savings, or give savings back, through Circle's kits
//   5. it writes what it did, and why, to the log the dashboard shows
import { decide, health as healthOf, liqPrice, RULE, type Decision } from "./brain.mjs";
import type { ArcBackend, LoanView, Move, SavingsView, WalletView } from "./arc.js";
import type { Config } from "./config.js";
import type { GeminiOdds, OddsDetail, OddsSnapshot } from "./gemini.js";
import type { Store } from "./state.js";

const SAMPLE_EVERY_MS = 15_000;
const COOLDOWN_MS = 8_000;           // after acting, wait before acting again (re-read first)
const pct = (x: number | null | undefined) => (x == null ? "n/a" : x < 0.001 && x > 0 ? "<0.1%" : `${+(x * 100).toFixed(1)}%`);
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const cents = (x: number, up = false) => (up ? Math.ceil(x * 100 - 1e-9) : Math.floor(x * 100 + 1e-9)) / 100;

export interface LadderStatus {
  ticker: string;
  title: string;
  expiryDate: string;
  volume: number | null;
  lowestStrike: number | null;
  highestStrike: number | null;
  odds: OddsDetail | null;
}
export interface Reading {
  at: number;
  loan: LoanView;
  savings: SavingsView | null;
  wallet: WalletView | null;
  spot: number | null;
  priceUsed: number;
  priceSource: "real" | "oracle";
  line: number;
  health: number;
  odds: OddsDetail | null;
  ladders: LadderStatus[];
  decision: Decision;
}

export class Bot {
  paused = false;
  last: Reading | null = null;
  syncing = false;
  noLoan = false;
  ticks = 0;
  lastTick: number | null = null;
  lastWake: { reason: string; at: number } | null = null;
  lastError: { at: number; message: string } | null = null;
  geminiError: string | null = null;
  private running = false;
  private again: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private cooldownUntil = 0;
  private zone: "safe" | "danger" | null = null;
  private warned = new Set<string>();
  private lastSampleAt = 0;
  private lastWakeLog = new Map<string, number>();

  constructor(private arc: ArcBackend, private gemini: GeminiOdds, private store: Store, private cfg: Config) {}

  get limit(): number { return this.store.limit ?? this.cfg.limit; }
  setLimit(x: number) {
    if (!(x > 0 && x < 1)) throw new Error("limit must be between 0 and 1");
    this.store.limit = x;
    this.store.log("info", `Your limit is now ${pct(x)}.`);
    this.wake("limit changed");
  }
  get busy() { return this.running; }
  get cooldownLeftMs() { return Math.max(0, this.cooldownUntil - Date.now()); }

  start() {
    this.timer = setInterval(() => this.wake("timer"), this.cfg.tickSeconds * 1000);
    this.wake("start");
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Alarm. Only one run at a time: a timer alarm during a run is skipped; news (webhook, stream) re-runs once after. */
  wake(reason: string, detail?: string) {
    this.lastWake = { reason, at: Date.now() };
    if (reason !== "timer") {
      const key = reason + (detail ?? "");
      const prev = this.lastWakeLog.get(key) ?? 0;
      if (Date.now() - prev > 10_000 && reason !== "start" && !reason.startsWith("re-read")) {
        this.store.log("info", `Woke up: ${reason}${detail ? ` (${detail})` : ""}.`);
        this.lastWakeLog.set(key, Date.now());
      }
    }
    if (this.running) {
      if (reason !== "timer") this.again = reason;
      return;
    }
    void this.tick(reason);
  }

  private async tick(reason: string) {
    this.running = true;
    try {
      await this.runOnce(reason);
      this.lastError = null;
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      if (this.lastError?.message !== message) this.store.log("error", `Run failed: ${message}`, (e as any)?.txs);
      this.lastError = { at: Date.now(), message };
    } finally {
      this.running = false;
      this.ticks++;
      this.lastTick = Date.now();
      if (this.again) {
        const r = this.again;
        this.again = null;
        setTimeout(() => this.wake(`re-read (${r})`), 250);
      }
    }
  }

  /** Read everything once and work out the decision. Does not act. */
  async read(): Promise<Reading | null> {
    const [loan, savings, wallet, odds, spot] = await Promise.all([
      this.arc.readLoan(),
      this.arc.readSavings().catch((e) => { this.warnOnce("savings-read", `Could not read savings: ${(e as Error).message}`); return null; }),
      this.arc.readWallet().catch(() => null),
      this.gemini.get(),
      this.gemini.spot(),
    ]);
    this.geminiError = odds.error ?? spot.error;
    if (!loan || loan.status === "closed") {
      this.noLoan = true;
      this.syncing = false;
      return null;
    }
    this.noLoan = false;
    if (loan.dataStatus !== "READY" || loan.debt == null || loan.collateral == null) {
      this.syncing = true;         // Borrow Kit is still catching up after a change
      return null;
    }
    this.syncing = false;
    if (!(loan.debt > 0) || !(loan.collateral > 0)) {
      this.noLoan = true;
      return null;
    }

    // Price the bitcoin. Arc Testnet's lending market uses a fixed $75,000 for cirBTC, so by default
    // the rule uses Gemini's live BTC price (what a mainnet oracle would report).
    let priceUsed: number | null = null;
    let priceSource: "real" | "oracle" = this.cfg.priceSource;
    if (priceSource === "real") priceUsed = spot.price;
    if (priceUsed == null) {
      priceUsed = loan.oraclePrice;
      priceSource = "oracle";
    }
    if (priceUsed == null && spot.price != null) {
      priceUsed = spot.price;
      priceSource = "real";
    }
    if (priceUsed == null) throw new Error("no BTC price (Gemini down and Borrow Kit gave no oracle price)");

    const oddsAt = odds.events.length ? odds.oddsAt : () => null;   // Gemini down: health rule only
    const lltv = this.arc.lltv;
    const decision = decide(
      { debt: loan.debt, collateral: loan.collateral, btcPrice: priceUsed, lltv },
      null,
      savings?.balance ?? 0,
      this.store.inLoan,
      this.limit,
      { oddsAt },
    );
    const line = liqPrice(loan.debt, loan.collateral, lltv);
    return {
      at: Date.now(),
      loan,
      savings,
      wallet,
      spot: spot.price,
      priceUsed,
      priceSource,
      line,
      health: healthOf(loan.debt, loan.collateral, priceUsed, lltv),
      odds: odds.events.length ? odds.detail(line) : null,
      ladders: this.ladderStatus(odds, line),
      decision,
    };
  }

  private ladderStatus(odds: OddsSnapshot, line: number): LadderStatus[] {
    return odds.events.map((e) => ({
      ticker: e.ticker,
      title: e.title,
      expiryDate: e.expiryDate,
      volume: e.volume,
      lowestStrike: e.ladder[0]?.strike ?? null,
      highestStrike: e.ladder[e.ladder.length - 1]?.strike ?? null,
      odds: odds.detailFor(e.ticker, line),
    }));
  }

  private async runOnce(reason: string) {
    const r = await this.read();
    if (!r) return;
    this.last = r;
    const d = r.decision;
    this.maybeSample(r);

    const zone = d.action === "repay" || d.action === "out_of_savings" ? "danger" : "safe";
    if (zone !== this.zone) {
      if (zone === "danger") this.store.log("warn", `Danger: ${this.why(d)}. Line ${usd(r.line)}, BTC ${usd(r.priceUsed)}.`);
      else if (this.zone === "danger") this.store.log("info", `Safe again: odds ${pct(d.odds)} (limit ${pct(this.limit)}), health ${d.health.toFixed(2)}.`);
      this.zone = zone;
      if (zone === "safe") this.warned.delete("out-of-savings");
    }

    if (this.paused || Date.now() < this.cooldownUntil) return;

    if (d.action === "repay") await this.save(r, d.repay, reason);
    else if (d.action === "give_back") await this.giveBack(r, d.borrow);
    else if (d.action === "out_of_savings")
      this.warnOnce("out-of-savings", `${this.why(d)}, but the savings pot is empty. Add USDC to savings or cirBTC to the loan.`);
  }

  private why(d: Decision) {
    return d.odds != null && d.odds > this.limit
      ? `odds hit ${pct(d.odds)} (limit ${pct(this.limit)})`
      : `health fell to ${d.health.toFixed(2)} (the rule acts under ${RULE.actBelowHealth.toFixed(2)})`;
  }

  private capLeft() { return Math.max(0, this.cfg.dailyCapUsdc - this.store.movedLast24h()); }

  private async save(r: Reading, wanted: number, reason: string) {
    const debt = r.loan.debt!;
    const savings = r.savings?.balance ?? 0;
    let amount = Math.min(cents(wanted, true), cents(savings), debt, cents(this.capLeft()));
    if (amount < 0.01) {
      if (this.capLeft() < 0.01) this.warnOnce("cap", `Daily cap of ${this.cfg.dailyCapUsdc} USDC reached. Not moving more money today.`);
      return;
    }
    const why = this.why(r.decision);
    if (this.cfg.dryRun) {
      this.store.log("action", `${cap(why)}. Would move ${amount.toFixed(2)} USDC from savings into the loan (dry run).`);
      this.cooldownUntil = Date.now() + COOLDOWN_MS;
      return;
    }
    const t0 = Date.now();
    const move: Move = await this.arc.moveSavingsIntoLoan(amount);
    this.store.inLoan = this.store.inLoan + move.amount;
    this.store.addMove(move.amount, "repay");
    const newLine = liqPrice(debt - move.amount, r.loan.collateral!, this.arc.lltv);
    this.store.log(
      "action",
      `${cap(why)}. Moved ${move.amount.toFixed(2)} USDC from savings into the loan in ${((Date.now() - t0) / 1000).toFixed(1)} s. Line is now ${usd(newLine)}.`,
      move.txs,
    );
    this.afterAction(r);
  }

  private async giveBack(r: Reading, wanted: number) {
    const amount = Math.min(cents(wanted), cents(this.capLeft()));
    if (amount < 0.01) return;
    if (this.cfg.dryRun) {
      this.store.log("action", `Calm again. Would give ${amount.toFixed(2)} USDC back to savings (dry run).`);
      this.cooldownUntil = Date.now() + COOLDOWN_MS;
      return;
    }
    const move = await this.arc.giveBack(amount);
    this.store.inLoan = this.store.inLoan - move.amount;
    this.store.addMove(move.amount, "give_back");
    const newLine = liqPrice(r.loan.debt! + move.amount, r.loan.collateral!, this.arc.lltv);
    this.store.log(
      "action",
      `Calm again (odds ${pct(r.decision.odds)}, health ${r.decision.health.toFixed(2)}). Gave ${move.amount.toFixed(2)} USDC back to savings. Line is now ${usd(newLine)}.`,
      move.txs,
    );
    this.afterAction(r);
  }

  private afterAction(r: Reading) {
    this.cooldownUntil = Date.now() + COOLDOWN_MS;
    this.lastSampleAt = 0;
    setTimeout(() => this.wake("re-read after acting"), 3000);
  }

  private maybeSample(r: Reading) {
    if (Date.now() - this.lastSampleAt < SAMPLE_EVERY_MS) return;
    this.lastSampleAt = Date.now();
    this.store.sample({
      t: r.at,
      odds: r.decision.odds,
      source: r.odds?.source ?? null,
      line: r.line,
      health: r.health,
      btc: r.priceUsed,
      debt: r.loan.debt,
      savings: r.savings?.balance ?? null,
    });
  }

  private warnOnce(key: string, text: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.store.log("warn", text);
  }

  // ------------------------------------------------------------------ demo controls
  private async fresh(): Promise<Reading> {
    for (let i = 0; i < 20; i++) {
      const r = await this.read();
      if (r) return r;
      if (this.noLoan) throw new Error("no open loan");
      await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error("loan data still syncing, try again in a few seconds");
  }

  /** "Push it to the edge": borrow more so the loan gets risky (the USDC stays in the wallet, as if spent). */
  async demoPush(): Promise<string> {
    const r = await this.fresh();
    const col = r.loan.collateral!, debt = r.loan.debt!;
    const target = (col * r.priceUsed * this.arc.lltv) / this.cfg.pushHealth;
    const maxDebt = await this.arc.maxDebt();
    const ceiling = Math.min(target, maxDebt != null ? maxDebt * 0.995 : target);
    const amount = cents(ceiling - debt);
    if (amount < 0.01) throw new Error("the loan is already at the edge (Borrow Kit will not lend more)");
    const move = await this.arc.borrowMore(amount);
    const line = liqPrice(debt + amount, col, this.arc.lltv);
    this.store.log("info", `Demo: pushed the loan to the edge. Borrowed ${amount.toFixed(2)} USDC more. Line is now ${usd(line)}.`, move.txs);
    setTimeout(() => this.wake("demo push"), 1000);
    return `borrowed ${amount.toFixed(2)} USDC`;
  }

  /** "Reset": repay from the wallet's own USDC back to a calm loan. The bot then gives savings back by itself. */
  async demoReset(): Promise<string> {
    const r = await this.fresh();
    const col = r.loan.collateral!, debt = r.loan.debt!;
    const target = (col * r.priceUsed * this.arc.lltv) / this.cfg.resetHealth;
    const spendable = Math.max(0, (r.wallet?.usdc ?? 0) - this.cfg.gasReserveUsdc);
    const amount = cents(Math.min(debt - target, spendable));
    if (amount < 0.01) throw new Error(debt - target < 0.01 ? "the loan is already calm" : "not enough USDC in the wallet to reset");
    const move = await this.arc.repayFromWallet(amount);
    const line = liqPrice(debt - amount, col, this.arc.lltv);
    this.store.log("info", `Demo: reset. Repaid ${amount.toFixed(2)} USDC from the wallet. Line is now ${usd(line)}.`, move.txs);
    setTimeout(() => this.wake("demo reset"), 1000);
    return `repaid ${amount.toFixed(2)} USDC`;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.store.log("info", p ? "Bot paused: it keeps reading but will not move money." : "Bot resumed.");
    if (!p) this.wake("resumed");
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
