// Gemini's live feed, on the server. It tells the bot WHEN to look, never WHAT to decide.
//
// The bot reads Gemini's ladders over REST and keeps them for about 20 s. This socket listens to the same bets
// (wss://ws.gemini.com: public, no key, read only) and calls `onMove` when the price of one of them moves. The
// server then throws the kept ladders away and wakes the bot, which reads the prices again over REST and
// decides exactly as before. So a move in the market reaches the loan in about two seconds instead of up to
// twenty-five, and nothing the bot decides on has changed. The same idea as the QuickNode Stream for the chain.
// If the socket is down, the bot simply goes on reading every 20 s.
import { FEED_URL, chanceOf, moved, readMessage, subscribeMessage } from "./gemini-live.mjs";

export interface FeedMove { symbol: string; from: number; to: number }

export class GeminiFeed {
  state: "off" | "connecting" | "live" | "down" = "off";
  /** Price updates heard since the server started, and how many of them moved a bet's chance. */
  heard = 0;
  moves = 0;
  lastAt: number | null = null;
  private ws: WebSocket | null = null;
  private symbols: string[] = [];
  private chance = new Map<string, number>();
  private retry: NodeJS.Timeout | null = null;
  private tries = 0;
  private stopped = false;

  constructor(private onMove: (move: FeedMove) => void) {}

  /** Listen to these bets. Called again with the same list it does nothing; with a new list it reconnects. */
  watch(symbols: (string | null | undefined)[]) {
    const next = [...new Set(symbols.filter((s): s is string => !!s).map((s) => s.toUpperCase()))].sort();
    if (!next.length || (next.join() === this.symbols.join() && this.state !== "off")) return;
    this.symbols = next;
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.close();
    this.state = "off";
  }

  summary() {
    return { state: this.state, bets: this.symbols.length, heard: this.heard, moves: this.moves, lastAt: this.lastAt };
  }

  private close() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch { /* already closed */ }
  }

  private open() {
    if (this.retry) clearTimeout(this.retry);
    this.close();
    if (this.stopped || typeof WebSocket === "undefined") { this.state = "off"; return; }
    this.state = "connecting";
    // prices from before a gap say nothing about what moved during it: start again from Gemini's first answer
    this.chance.clear();
    let ws: WebSocket;
    try { ws = new WebSocket(FEED_URL); } catch { this.lost(); return; }
    this.ws = ws;
    // nothing thrown in here may reach the process: a socket that fails just means reading every 20 s again
    ws.onopen = () => {
      try { ws.send(JSON.stringify(subscribeMessage(this.symbols))); } catch { if (this.ws === ws) this.lost(); }
    };
    ws.onmessage = (m) => {
      let msg;
      try { msg = readMessage(JSON.parse(String(m.data))); } catch { return; }
      if (!msg) return;
      this.tries = 0;
      if (msg.kind === "answer") {
        if (msg.ok) this.state = "live";
        else this.lost();
        return;
      }
      this.state = "live";
      this.heard++;
      this.lastAt = Date.now();
      if (msg.kind !== "quote") return;
      const to = chanceOf(msg);
      if (to == null) return;
      const from = this.chance.get(msg.symbol);
      this.chance.set(msg.symbol, to);
      if (moved(from, to)) {
        this.moves++;
        try { this.onMove({ symbol: msg.symbol, from: from as number, to }); } catch { /* the listener's problem */ }
      }
    };
    ws.onclose = () => { if (this.ws === ws) this.lost(); };
    ws.onerror = () => { if (this.ws === ws) this.lost(); };
  }

  private lost() {
    this.close();
    if (this.stopped) return;
    this.state = "down";
    this.tries++;
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => this.open(), Math.min(60_000, 1000 * 2 ** Math.min(this.tries, 6)));
    this.retry.unref?.();
  }
}
