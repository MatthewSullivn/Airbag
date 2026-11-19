// The hedge, placed for real on Gemini's TEST site.
//
// When Airbag has just paid a loan down, this buys the "No" contracts that would pay for what a sell-off of
// the loan would still cost (src/hedge.mjs works out which bet and how many, from Gemini's live prices). When
// the loan is calm again and the savings go back, it cancels what is still open of that order.
// Test money only: src/gemini-trade.ts can reach nothing but Gemini's sandbox. Without a sandbox key in .env
// none of this runs, and the hedge stays a quote on the page.
// It is an extra beside the save: every failure in here is caught and logged, and never touches a save.
import type { GeminiSandbox, PlacedOrder } from "./gemini-trade.js";
import { hedgeOrder, hedgeQuote, type BetPrice } from "./hedge.mjs";

export interface HedgeRecord {
  at: number;
  /** The wallet it is for; null = the loan this server's own bot guards. */
  owner: string | null;
  orderId: string;
  symbol: string;
  strike: number;
  quantity: string;
  /** What one contract cost: the price it was filled at, or the limit while it is still open. */
  price: string;
  /** The most the order was willing to pay for one contract. */
  limit: string;
  /** open, filled or cancelled, as Gemini answered. */
  status: string;
}
export interface Saved { owner: string | null; debt: number; line: number; lltv: number; ticker: string | null }

const cents = (p: string) => `${Math.round(Number(p) * 100)}¢`;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export class Hedger {
  last: HedgeRecord | null = null;
  lastError: { at: number; message: string } | null = null;
  private open = new Map<string, HedgeRecord>();
  private termsOk = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private gemini: GeminiSandbox,
    private log: (level: "info" | "warn", text: string, who?: string) => void,
    private betsFor: (ticker: string) => Promise<BetPrice[]>,
  ) {}

  get enabled() { return this.gemini.enabled; }

  summary() {
    return { enabled: this.enabled, last: this.last, open: [...this.open.values()], lastError: this.lastError };
  }

  /** Airbag has just paid a loan down. Never throws. */
  saved(x: Saved) { return this.run(() => this.place(x)); }
  /** The loan is calm again and its savings went back. Never throws. */
  calm(owner: string | null) { return this.run(() => this.cancel(owner, true)); }

  private run(job: () => Promise<void>) {
    if (!this.enabled) return Promise.resolve();
    this.queue = this.queue.then(job).catch((e) => {
      const message = String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);
      if (this.lastError?.message !== message) this.log("warn", `Hedge on Gemini's test site not placed: ${message}`);
      this.lastError = { at: Date.now(), message };
    });
    return this.queue;
  }

  private async place(x: Saved) {
    if (!x.ticker || !(x.debt > 0)) return;
    if (!this.termsOk) {
      const t = await this.gemini.termsStatus();
      if (!t?.hasAcceptedLatest) throw new Error("this test account has not accepted Gemini's prediction market terms yet (npm run hedge:test says how)");
      this.termsOk = true;
    }
    // the prices are the real market's; the bet must be one the test site lists too (it has fewer)
    const listed = await this.gemini.listed(x.ticker);
    const bets = (await this.betsFor(x.ticker)).filter((b) => b.symbol && listed.has(b.symbol.toUpperCase()));
    const order = hedgeOrder(hedgeQuote({ bets, line: x.line, debt: x.debt, lltv: x.lltv }));
    if (!order) throw new Error("the test site lists no bet at or above the loan's price that has a price right now");
    await this.cancel(x.owner, false);                        // one hedge per loan: the newer one replaces the older
    const placed: PlacedOrder = await this.gemini.placeOrder(order);
    const strike = Number(order.symbol.match(/-HI(\d+(?:\.\d+)?)$/)?.[1] ?? NaN);
    const status = String(placed.status ?? "open");
    const paid = Number(placed.avgExecutionPrice);
    const rec: HedgeRecord = { at: Date.now(), owner: x.owner, orderId: String(placed.orderId), symbol: order.symbol, strike, quantity: order.quantity, price: status === "filled" && paid > 0 && paid < 1 ? String(paid) : order.price, limit: order.price, status };
    this.last = rec;
    if (rec.status === "open") this.open.set(x.owner ?? "", rec);
    this.lastError = null;
    this.log("info", `Hedge on Gemini's test site: bought ${rec.quantity} "No" on "${Number.isFinite(strike) ? usd(strike) : order.symbol} or above" at ${cents(rec.price)} each (order ${rec.orderId}, ${rec.status}${rec.price !== rec.limit ? `, limit ${cents(rec.limit)}` : ""}). It pays if bitcoin ends below that price.`, x.owner ?? undefined);
  }

  private async cancel(owner: string | null, say: boolean) {
    const key = owner ?? "";
    const rec = this.open.get(key);
    if (!rec) return;
    this.open.delete(key);
    try {
      await this.gemini.cancelOrder(rec.orderId);
      rec.status = "cancelled";
      if (say) this.log("info", `Hedge on Gemini's test site: calm again, so order ${rec.orderId} was cancelled.`, owner ?? undefined);
    } catch (e) {
      // already filled or already gone: nothing left to cancel
      if (say) this.log("info", `Hedge on Gemini's test site: order ${rec.orderId} was not open any more (${String((e as Error).message).slice(0, 80)}).`, owner ?? undefined);
    }
  }
}
