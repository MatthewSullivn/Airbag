// Gemini's live feed, on the page: each bet's best bid and ask, and every trade, the moment they change.
// A public WebSocket (wss://ws.gemini.com): no key, and nothing is sent but the list of bets to listen to.
// What a message means lives in src/gemini-live.mjs (pure, tested, shared with the server); this file only
// keeps the connection. The big number is still the bot's own reading: this feed shows the market it reads.
import { useEffect, useMemo, useRef, useState } from "react";
import { FEED_URL, liveLadder, readMessage, subscribeMessage, type FeedQuote, type LivePoint } from "@live";
import type { LadderEvent, Ladders } from "./api";

export interface LiveQuote extends FeedQuote {
  bid: number | null;
  ask: number | null;
  /** The last traded price of "Yes" and how many contracts, once the bet has traded. */
  last: number | null;
  lastSize: number | null;
  /** When this page last heard about this bet (the page's own clock). */
  at: number;
}
export interface LiveTrade { symbol: string; price: number; size: number; at: number; id: string }
export interface GeminiFeed {
  /** "live" only while the socket is open and Gemini has answered. */
  state: "connecting" | "live" | "down";
  /** By bet symbol in upper case, e.g. GEMI-BTC2611302200-HI62500. Empty while not live: nothing stale is shown. */
  quotes: Record<string, LiveQuote>;
  /** Trades seen since the page opened, newest first (at most 20). */
  trades: LiveTrade[];
  /** Price updates heard since the page opened. */
  heard: number;
  /** When the newest one arrived. */
  lastAt: number | null;
}

const EMPTY: GeminiFeed = { state: "connecting", quotes: {}, trades: [], heard: 0, lastAt: null };
const NO_QUOTE: LiveQuote = { bid: null, ask: null, last: null, lastSize: null, at: 0 };

/**
 * Listen to these bets. `symbols` are Gemini's instrument symbols (from /api/ladders). The socket reconnects by
 * itself, a little slower each time. While it is down the page falls back to the server's own read (20 s old at
 * most), so nothing on the page depends on this connection.
 */
export function useGeminiFeed(symbols: (string | null | undefined)[]): GeminiFeed {
  const [feed, setFeed] = useState<GeminiFeed>(EMPTY);
  // what has arrived since the last paint: a burst comes when the socket opens, and a busy market sends many a second
  const pending = useRef<{ quotes: Record<string, Partial<LiveQuote>>; trades: LiveTrade[]; heard: number }>({ quotes: {}, trades: [], heard: 0 });
  const key = [...new Set(symbols.filter((s): s is string => !!s).map((s) => s.toUpperCase()))].sort().join(",");

  useEffect(() => {
    if (!key || typeof WebSocket === "undefined") return;
    const want = key.split(",");
    let ws: WebSocket | null = null;
    let closed = false, tries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let flush: ReturnType<typeof setTimeout> | undefined;

    const paint = () => {
      flush = undefined;
      const p = pending.current;
      pending.current = { quotes: {}, trades: [], heard: 0 };
      setFeed((f) => {
        const quotes = { ...f.quotes };
        for (const [s, q] of Object.entries(p.quotes)) quotes[s] = { ...(quotes[s] ?? NO_QUOTE), ...q };
        return {
          state: "live",
          quotes,
          trades: p.trades.length ? [...p.trades.reverse(), ...f.trades].slice(0, 20) : f.trades,
          heard: f.heard + p.heard,
          lastAt: p.heard ? Date.now() : f.lastAt,
        };
      });
    };
    const soon = () => { if (flush === undefined) flush = setTimeout(paint, 150); };

    const open = () => {
      if (closed) return;
      try { ws = new WebSocket(FEED_URL); } catch { ws = null; }
      if (!ws) { setFeed((f) => ({ ...f, state: "down", quotes: {} })); return; }
      const mine = ws;
      mine.onopen = () => mine.send(JSON.stringify(subscribeMessage(want)));
      mine.onmessage = (m) => {
        let j: unknown;
        try { j = JSON.parse(String(m.data)); } catch { return; }
        const msg = readMessage(j);
        if (!msg) return;
        tries = 0;
        if (msg.kind === "answer") {
          if (!msg.ok) { try { mine.close(); } catch { /* already closed */ } return; }
        } else if (msg.kind === "quote") {
          const q: Partial<LiveQuote> = { bid: msg.bid, ask: msg.ask, at: Date.now() };
          if (msg.last != null) { q.last = msg.last; q.lastSize = msg.lastSize; }
          pending.current.quotes[msg.symbol] = { ...pending.current.quotes[msg.symbol], ...q };
          pending.current.heard++;
        } else {
          pending.current.trades.push({ symbol: msg.symbol, price: msg.price, size: msg.size, at: Date.now(), id: msg.id });
          pending.current.quotes[msg.symbol] = { ...pending.current.quotes[msg.symbol], last: msg.price, lastSize: msg.size, at: Date.now() };
          pending.current.heard++;
        }
        soon();
      };
      const lost = () => {
        if (closed || ws !== mine) return;
        // what was heard before the gap may be out of date by the time the socket is back: show none of it
        clearTimeout(flush);
        flush = undefined;
        pending.current = { quotes: {}, trades: [], heard: 0 };
        setFeed((f) => ({ ...f, state: "down", quotes: {} }));
        tries++;
        clearTimeout(retry);
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(tries, 5)));
      };
      mine.onclose = lost;
      mine.onerror = () => { try { mine.close(); } catch { /* already closed */ } };
    };
    open();

    return () => {
      closed = true;
      clearTimeout(retry);
      clearTimeout(flush);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; try { ws.close(); } catch { /* already closed */ } }
    };
  }, [key]);

  return feed;
}

/** Every bet of the ladders the bot reads, for one subscription. */
export const symbolsOf = (ladders: Ladders | null | undefined) => (ladders?.events ?? []).flatMap((e) => (e.bets ?? []).map((b) => b.symbol));

export interface LiveEvent extends LadderEvent { live: LivePoint[] }
/** The ladders with the feed's fresher prices laid over them (the server's own numbers wherever the feed is silent). */
export function useLiveEvents(ladders: Ladders | null | undefined, feed: GeminiFeed): LiveEvent[] {
  return useMemo(
    () => (ladders?.events ?? []).map((e) => ({ ...e, live: liveLadder(e.ladder, e.bets ?? [], feed.state === "live" ? feed.quotes : null) })),
    [ladders, feed.state, feed.quotes],
  );
}
