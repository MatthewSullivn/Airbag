// The shapes the server sends (src/server.ts), and the hooks that keep them fresh.
import { useEffect, useRef, useState } from "react";

export interface OddsDetail { odds: number; source: "quoted" | "estimated"; ticker: string }
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
  loan: { debt: number; collateral: number; borrowApy: number | null; healthFactor: number | null; band: string | null; oraclePrice: number | null };
  savings: { vaultName: string; balance: number; apy: number | null } | null;
  inLoan: number;
  spot: number | null;
  priceUsed: number;
  priceSource: "real" | "oracle";
  line: number;
  health: number;
  odds: OddsDetail | null;
  ladders: LadderStatus[];
  decision: { odds: number | null };
  /** Only on a connected wallet's loan: false = the bot is not watching it (yet). */
  protected?: boolean;
}
export interface TxRef { label: string; hash?: string; url?: string }
export interface LogEntry { t: number; level: "action" | "info" | "warn" | "error"; text: string; txs?: TxRef[]; who?: string }
export interface Sample { t: number; odds: number | null; source: string | null; line: number | null; health: number | null; btc: number | null }
export interface StreamEvent { t: number; block: number | null; tx: string | null; kind: string; detail: string }
export interface HedgeOrderPlaced { at: number; owner: string | null; orderId: string; symbol: string; strike: number; quantity: string; price: string; limit?: string; status: string }
export interface GuardInfo {
  address: string;
  capUsdc: number;
  inLoan: number;
  since: number;
  lastMove: { t: number; kind: "save" | "give_back"; usdc: number; tx: string } | null;
  lastError: string | null;
}
export interface Status {
  now: number;
  mode: "live" | "sim";
  publicDemo: boolean;
  dryRun: boolean;
  paused: boolean;
  explorer: string | null;
  wallet: { address: string; usdc?: number | null; cirbtc?: number | null };
  custody: { mode: "owner-key" | "guard"; guard: string | null; botKeyAddress: string | null; ownerKeyOnServer: boolean; guardDailyCapUsdc: number | null } | null;
  protector: { enabled: boolean; why: string | null; botAddress: string | null; botGasUsdc: number | null; loans: { guard: string; owner: string; inLoan: number; lastError: string | null }[] };
  /** The hedge as a real order on Gemini's TEST site: on only when the server has a sandbox key. */
  hedge?: { enabled: boolean; last: HedgeOrderPlaced | null; open: HedgeOrderPlaced[]; lastError: { at: number; message: string } | null };
  marketId: string | null;
  lltv: number;
  limit: number;
  rule: { actBelowHealth: number; repayToHealth: number; giveBackAbove: number; giveBackFloor: number };
  dailyCapUsdc: number;
  movedLast24h: number;
  bot: {
    busy: boolean;
    syncing: boolean;
    noLoan: boolean;
    ticks: number;
    lastTick: number | null;
    lastWake: { reason: string; at: number } | null;
    lastError: { at: number; message: string } | null;
    geminiError: string | null;
    /** The server's own connection to Gemini's live feed, which wakes the bot when a bet's price moves. */
    geminiFeed?: { state: "off" | "connecting" | "live" | "down"; bets: number; heard: number; moves: number; lastAt: number | null };
    tickSeconds: number;
    cooldownLeftMs: number;
  };
  reading: Reading | null;
  log: LogEntry[];
  samples: Sample[];
  stream: StreamEvent[];
  /** Stream deliveries about other people's loans in the same market since the server started: counted, never acted on. */
  streamOthers?: { count: number; lastAt: number | null; since: number };
}
export interface WalletView {
  address: string;
  usdc: number;
  cirbtc: number;
  savings: number;
  loan: { debt: number; collateral: number; line: number; health: number; priceUsed: number; priceSource: "real" | "oracle"; odds: OddsDetail | null; oddsBy: string | null } | null;
  market: { lltv: number; oraclePrice: number; priceUsed: number; priceSource: "real" | "oracle" };
  at: number;
  reading: Reading | null;
  offers: { collateralFree: number; suggestBorrow: number; maxBorrow: number; minHealth: number; savingsMax: number; suggestCap: number };
  protectedHere: boolean;
  protection: { available: boolean; why: string | null; guard: GuardInfo | null };
  demo: { pushHealth: number; calmHealth: number };
  explorer: string;
}
export interface LadderPoint { strike: number; pAbove: number }
/** One bet on Gemini and what it costs to buy each side right now. A "No" pays 1 dollar if bitcoin ends below the strike. */
export interface BetPrice { strike: number; buyYes: number | null; buyNo: number | null; symbol: string | null }
export interface LadderEvent { ticker: string; title: string; expiryDate: string; volume: number | null; ladder: LadderPoint[]; bets?: BetPrice[]; url?: string | null }
export interface Ladders { at: number; spot: number | null; error: string | null; events: LadderEvent[] }
/** Gemini's own hourly history for each bet of one ladder: [time, chance it ends at or above the price (last traded), contracts traded]. */
export interface MarketHistory { at: number; ticker: string; title: string; expiryDate: string; frame: string; series: { strike: number; symbol: string; points: [number, number, number][] }[] }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

/** Polls one endpoint. Keeps the last good answer while a request fails, so the page never blanks. */
export function usePoll<T>(url: string | null, everyMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!url) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await getJson<T>(url);
        if (!alive.current) return;
        setData(next);
        setError(null);
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      } finally {
        if (alive.current && everyMs > 0) timer = setTimeout(tick, everyMs);
      }
    };
    tick();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [url, everyMs]);
  return { data, error };
}

export interface GasPrices { at: number; testnet: { chainId: number; gasPriceWei: string } | null; mainnet: { chainId: number; gasPriceWei: string } | null }
export const useGasPrices = () => usePoll<GasPrices>("/api/gas", 5 * 60_000);

export const useStatus = () => usePoll<Status>("/api/status", 1500);
export const useLadders = () => usePoll<Ladders>("/api/ladders", 20_000);
export const useMarketHistory = (ticker: string | null | undefined) => usePoll<MarketHistory>(ticker ? `/api/market-history?ticker=${encodeURIComponent(ticker)}` : null, 10 * 60_000);

export interface CrashReplay {
  params: { start: string; limit: number; savingsPct: number; liquidationIncentive: number; volWindowDays: number; horizonDays: number };
  headline: {
    untouched: { openPrice: number; ltv: number; debt0: number; line0: number; liquidation: { date: string; price: number; btcKept: number } | null };
    intraday: { liquidated: boolean; maxInLoan: number; savings: number; avgInPot: number; liquidation?: { date: string } };
    daily: { liquidated: boolean; liquidation?: { date: string } };
  };
  chart: { date: string; low: number; close: number; untouchedLine0: number; airbagLine: number; inLoan: number }[];
  table: { ltv: number; mode: "untouched" | "daily" | "intraday"; liquidated: boolean; line0: number; btcKept: number; maxInLoan: number; savings: number; avgInPot: number; liquidation?: { date: string } }[];
}
export const useCrashReplay = () => usePoll<CrashReplay>("/api/replay", 0);

export async function postJson<T = unknown>(path: string, body: unknown, key = ""): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-airbag-key": key } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}
