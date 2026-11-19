// Types for gemini-live.mjs.
export const FEED_URL: string;
/** The newest best bid and ask heard for one bet's "Yes" (0 to 1). null = nobody quotes that side. */
export interface FeedQuote { bid: number | null; ask: number | null; last?: number | null; lastSize?: number | null }
export type FeedMessage =
  | { kind: "answer"; ok: boolean }
  | { kind: "quote"; symbol: string; bid: number | null; ask: number | null; last: number | null; lastSize: number | null }
  | { kind: "trade"; symbol: string; price: number; size: number; id: string };
export interface LivePoint { strike: number; pAbove: number; symbol: string | null; bid: number | null; ask: number | null; last: number | null; /** true = this number came from the feed, false = from the server's last read */ live: boolean }
export function subscribeMessage(symbols: readonly string[], id?: string): { id: string; method: "SUBSCRIBE"; params: string[] };
export function readMessage(message: unknown): FeedMessage | null;
export function chanceOf(quote: FeedQuote | null | undefined): number | null;
export function moved(before: number | null | undefined, after: number | null | undefined, min?: number): boolean;
export function buyNoOf(quote: FeedQuote | null | undefined): number | null;
export function liveLadder(
  ladder: readonly { strike: number; pAbove: number }[] | null | undefined,
  bets: readonly { strike: number; symbol: string | null }[] | null | undefined,
  quotes: Readonly<Record<string, FeedQuote>> | null | undefined,
): LivePoint[];
export function betsAround<T extends { strike: number }>(ladder: readonly T[] | null | undefined, line: number | null | undefined, count?: number): T[];
