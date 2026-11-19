// Orders on Gemini's prediction markets, on Gemini's TEST site only.
//
// Gemini's sandbox (exchange.sandbox.gemini.com) lists the same prediction markets as the real site, with test
// money. This file can place, list and cancel orders there, signed with a sandbox API key (Trader role).
// The host below is a constant on purpose: nothing in this project can send an order to the real site, so a
// real key put in .env by mistake could never trade real money through it (the sandbox simply rejects it).
// The key and secret come from .env, are never logged and never reach the browser.
import { parseKeepingLongNumbers, signedHeaders, wholeNumber } from "./gemini-sign.mjs";

const SANDBOX = "https://api.sandbox.gemini.com";

export interface OrderRequest { symbol: string; orderType: "limit"; side: "buy" | "sell"; outcome: "yes" | "no"; quantity: string; price: string; timeInForce: "good-til-cancel" | "immediate-or-cancel" | "fill-or-kill" }
export interface PlacedOrder {
  /** Gemini's order number, as text: it is too long for a JavaScript number. */
  orderId: string;
  status: "open" | "filled" | "cancelled" | string;
  symbol: string;
  side: string;
  outcome: string;
  quantity: string;
  filledQuantity?: string;
  remainingQuantity?: string;
  price: string;
  avgExecutionPrice?: string;
  createdAt?: string;
}
export interface TermsStatus { hasAcceptedLatest: boolean; acceptedVersion?: number; latestVersion?: number }
export interface Position { symbol: string; outcome: "yes" | "no"; totalQuantity: string; avgPrice: string; quantityOnHold?: string }

export class GeminiSandbox {
  /** Gemini's clock minus ours, in ms. A time-based key only accepts a nonce within 30 s of Gemini's own clock. */
  private offsetMs: number | null = null;
  private lastNonce = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private listedCache = new Map<string, { at: number; symbols: Set<string> }>();

  constructor(private key: string, private secret: string) {}

  /**
   * The bets of one market that exist on the test site. It lists fewer than the real site: on Nov 19, 2026 the
   * Nov 30 bitcoin market had 8 bets there ($67,500 and up) against 12 on the real site ($57,500 and up), and an
   * order for a bet it does not have is refused ("SymbolNotFound"). Public, unsigned, kept for ten minutes.
   */
  async listed(ticker: string): Promise<Set<string>> {
    const hit = this.listedCache.get(ticker);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.symbols;
    const res = await fetch(`${SANDBOX}/v1/prediction-markets/events/${encodeURIComponent(ticker)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Gemini's test site does not list the market ${ticker} (${res.status})`);
    const event = (await res.json()) as { contracts?: { instrumentSymbol?: unknown; status?: unknown }[] };
    const symbols = new Set((event.contracts ?? []).filter((c) => typeof c.instrumentSymbol === "string" && (c.status == null || c.status === "active")).map((c) => String(c.instrumentSymbol).toUpperCase()));
    this.listedCache.set(ticker, { at: Date.now(), symbols });
    return symbols;
  }

  get enabled() { return !!this.key && !!this.secret; }

  private async syncClock() {
    const res = await fetch(`${SANDBOX}/v1/pubticker/btcusd`, { signal: AbortSignal.timeout(8000) });
    const theirs = Date.parse(res.headers.get("date") ?? "");
    this.offsetMs = Number.isFinite(theirs) ? theirs - Date.now() : 0;
  }

  /** Seconds on Gemini's clock, and always higher than the last one used (so both kinds of key accept it). */
  private async nonce() {
    if (this.offsetMs == null) await this.syncClock();
    const now = Math.floor((Date.now() + (this.offsetMs ?? 0)) / 1000);
    this.lastNonce = Math.max(now, this.lastNonce + 1);
    return this.lastNonce;
  }

  /** One signed call at a time. Errors say what Gemini answered, never what was sent. */
  private call<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.enabled) throw new Error("no Gemini sandbox key (GEMINI_SANDBOX_KEY and GEMINI_SANDBOX_SECRET in .env)");
      for (let attempt = 0; ; attempt++) {
        const headers = signedHeaders({ path, params, key: this.key, secret: this.secret, nonce: await this.nonce() });
        const res = await fetch(SANDBOX + path, { method, headers, signal: AbortSignal.timeout(12_000) });
        const text = await res.text();
        let body: any = null;
        try { body = parseKeepingLongNumbers(text); } catch { /* not JSON */ }
        if (res.ok) return body as T;
        const why = [body?.reason, body?.message, body?.error].filter((x) => typeof x === "string").join(": ") || text.slice(0, 140);
        // a nonce outside Gemini's window: our idea of its clock was off. Look again, once.
        if (attempt === 0 && /nonce/i.test(why)) { this.offsetMs = null; continue; }
        throw new Error(`Gemini's test site answered ${res.status}: ${why}`);
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Has this account accepted Gemini's prediction market terms? Orders are refused until it has. */
  termsStatus() { return this.call<TermsStatus>("GET", "/v1/prediction-markets/terms/status"); }
  /** Accepting terms is the account owner's decision: only the owner's own command calls this (scripts/hedge-test.ts). */
  acceptTerms() { return this.call<{ success: boolean }>("POST", "/v1/prediction-markets/terms/accept"); }
  placeOrder(order: OrderRequest) { return this.call<PlacedOrder>("POST", "/v1/prediction-markets/order", { ...order }); }
  cancelOrder(orderId: string) { return this.call<{ result: string; message?: string }>("POST", "/v1/prediction-markets/order/cancel", { orderId: wholeNumber(orderId) }); }
  /** Orders that are filled or cancelled, newest first. */
  async orderHistory(symbol?: string, status: "filled" | "cancelled" = "filled") {
    const r = await this.call<{ orders?: PlacedOrder[] }>("POST", "/v1/prediction-markets/orders/history", symbol ? { status, symbol, limit: 50 } : { status, limit: 50 });
    return r?.orders ?? [];
  }
  /** The contracts this test account holds. */
  async positions() {
    const r = await this.call<{ positions?: Position[] }>("POST", "/v1/prediction-markets/positions");
    return r?.positions ?? [];
  }
  async activeOrders(symbol?: string) {
    const r = await this.call<{ orders?: PlacedOrder[] }>("POST", "/v1/prediction-markets/orders/active", symbol ? { symbol, limit: 100 } : { limit: 100 });
    return r?.orders ?? [];
  }
}
