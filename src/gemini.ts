// Gemini: the odds (prediction-market ladders) and the live BTC price. Public API, no key, read only.
import { fetchEvent, makeOddsModel } from "./brain.mjs";

const API = "https://api.gemini.com";
const LADDER_TTL_MS = 20_000;     // plan: refresh every 15 to 30 seconds and cache
const SPOT_TTL_MS = 10_000;
const DISCOVER_TTL_MS = 30 * 60_000;

export interface LadderPoint { strike: number; pAbove: number }
export interface GeminiEvent {
  ticker: string;
  title: string;
  status: string;
  expiryDate: string;
  volume: number | null;
  ladder: LadderPoint[];
}
export interface OddsDetail { odds: number; source: "quoted" | "estimated"; ticker: string }
export interface OddsSnapshot {
  events: GeminiEvent[];
  oddsAt: (line: number) => number | null;
  detail: (line: number) => OddsDetail | null;
  /** Odds for one ladder only (for showing each ladder separately). */
  detailFor: (ticker: string, line: number) => OddsDetail | null;
  fetchedAt: number;
  error: string | null;
}

async function getJson(url: string, timeoutMs = 8000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status} for ${url.replace(API, "")}`);
  return res.json();
}

/** Active "BTC price on <date>" ladders, most traded first. Ticker pattern: BTC + YYMMDD + 2200. */
export async function discoverBtcLadders(): Promise<{ ticker: string; title: string; expiryDate: string; volume: number }[]> {
  const found: { ticker: string; title: string; expiryDate: string; volume: number }[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const page = await getJson(`${API}/v1/prediction-markets/events?status=active&category=crypto&limit=50&offset=${offset}`);
    const items: any[] = page?.data ?? [];
    for (const e of items) {
      if (/^BTC\d{6}2200$/.test(e.ticker) && (e.contracts?.length ?? 0) >= 5 && Date.parse(e.expiryDate) > Date.now() + 3600_000)
        found.push({ ticker: e.ticker, title: e.title, expiryDate: e.expiryDate, volume: Number(e.volume ?? 0) });
    }
    const total = Number(page?.pagination?.total ?? 0);
    if (items.length < 50 || offset + 50 >= total) break;
  }
  return found.sort((a, b) => b.volume - a.volume);
}

export class GeminiOdds {
  private cache: OddsSnapshot | null = null;
  private inflight: Promise<OddsSnapshot> | null = null;
  private discovered: { at: number; tickers: string[] } | null = null;
  private spotCache: { at: number; price: number } | null = null;
  private stale = false;

  constructor(private configured: string[]) {}

  /** The odds model from the configured ladders (or discovered ones), cached for ~20 s. Never throws. */
  async get(): Promise<OddsSnapshot> {
    if (this.cache && !this.stale && Date.now() - this.cache.fetchedAt < LADDER_TTL_MS) return this.cache;
    if (!this.inflight) {
      this.stale = false;
      this.inflight = this.refresh().finally(() => (this.inflight = null));
    }
    return this.inflight;
  }

  /**
   * Gemini's live feed says a price moved: the next get() reads the ladders again instead of answering from
   * the last 20 s. (A read that is already on its way is let finish; the one after it is fresh.)
   */
  expire() {
    this.stale = true;
  }

  private async tickers(): Promise<string[]> {
    if (this.configured.length) return this.configured;
    if (this.discovered && Date.now() - this.discovered.at < DISCOVER_TTL_MS) return this.discovered.tickers;
    const list = await discoverBtcLadders();
    const tickers = list.slice(0, 2).map((e) => e.ticker);
    this.discovered = { at: Date.now(), tickers };
    return tickers;
  }

  private async refresh(): Promise<OddsSnapshot> {
    let error: string | null = null;
    let events: GeminiEvent[] = [];
    try {
      const tickers = await this.tickers();
      const results = await Promise.allSettled(tickers.map((t) => fetchEvent(t) as Promise<GeminiEvent>));
      events = results.flatMap((r) => (r.status === "fulfilled" && r.value.status === "active" && r.value.ladder.length ? [r.value] : []));
      const failed = results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason?.message ?? r));
      if (!events.length && this.configured.length) {
        // configured ladders expired or failed: fall back to discovery once
        const list = await discoverBtcLadders();
        const more = await Promise.allSettled(list.slice(0, 2).map((e) => fetchEvent(e.ticker) as Promise<GeminiEvent>));
        events = more.flatMap((r) => (r.status === "fulfilled" && r.value.ladder.length ? [r.value] : []));
        if (events.length) error = `configured ladders unavailable (${failed.join("; ") || "not active"}), using ${events.map((e) => e.ticker).join(", ")}`;
      }
      if (!events.length) error = error ?? (failed.join("; ") || "no active BTC ladder found");
    } catch (e) {
      error = (e as Error).message;
    }
    if (!events.length && this.cache?.events.length) {
      // keep the last good ladders for a while rather than going blind
      return (this.cache = { ...this.cache, error: `${error} (showing ladders from ${new Date(this.cache.fetchedAt).toISOString()})` });
    }
    const model = makeOddsModel(events);
    const perTicker = new Map(events.map((e) => [e.ticker, makeOddsModel([e])]));
    this.cache = {
      events,
      oddsAt: model.oddsAt,
      detail: model.detail as (line: number) => OddsDetail | null,
      detailFor: (ticker, line) => (perTicker.get(ticker)?.detail(line) as OddsDetail | null) ?? null,
      fetchedAt: Date.now(),
      error,
    };
    return this.cache;
  }

  /** Live BTC/USD last trade on Gemini, cached ~10 s. Returns the last good price (or null) on failure. */
  async spot(): Promise<{ price: number | null; error: string | null }> {
    if (this.spotCache && Date.now() - this.spotCache.at < SPOT_TTL_MS) return { price: this.spotCache.price, error: null };
    try {
      const t = await getJson(`${API}/v1/pubticker/btcusd`, 5000);
      const price = Number(t.last);
      if (!(price > 0)) throw new Error("bad BTC price from Gemini");
      this.spotCache = { at: Date.now(), price };
      return { price, error: null };
    } catch (e) {
      const stale = this.spotCache && Date.now() - this.spotCache.at < 10 * 60_000 ? this.spotCache.price : null;
      return { price: stale, error: (e as Error).message };
    }
  }
}
