// The bot's memory: what it did (log), the odds over time (samples), how much savings is inside
// the loan, and how much money it moved in the last 24 h (for the daily cap). Kept in a JSON file.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TxRef } from "./arc.js";

export type Level = "action" | "info" | "warn" | "error";
export interface LogEntry { t: number; level: Level; text: string; txs?: TxRef[]; who?: string }
export interface Sample {
  t: number;
  odds: number | null;
  source: string | null;
  line: number | null;
  health: number | null;
  btc: number | null;
  debt: number | null;
  savings: number | null;
}
export interface StreamEvent { t: number; block: number | null; tx: string | null; kind: string; detail: string }
interface Persisted {
  version: 1;
  inLoan: number;
  moves: { t: number; usdc: number; kind: "repay" | "give_back" }[];
  limit: number | null;
  log: LogEntry[];
  samples: Sample[];
  stream: StreamEvent[];
}

const DAY = 24 * 3600_000;
const MAX_LOG = 400;
const MAX_STREAM = 100;

export class Store {
  private data: Persisted;
  private saveTimer: NodeJS.Timeout | null = null;

  /** fresh = ignore what is on disk (the simulator starts from a clean slate every run). */
  constructor(private file: string, { fresh = false } = {}) {
    const empty: Persisted = { version: 1, inLoan: 0, moves: [], limit: null, log: [], samples: [], stream: [] };
    try {
      this.data = !fresh && existsSync(file) ? { ...empty, ...JSON.parse(readFileSync(file, "utf8")) } : empty;
    } catch {
      this.data = empty;
    }
  }

  get inLoan() { return this.data.inLoan; }
  set inLoan(v: number) { this.data.inLoan = Math.max(0, Math.round(v * 1e6) / 1e6); this.save(); }

  get limit() { return this.data.limit; }
  set limit(v: number | null) { this.data.limit = v; this.save(); }

  /** `who` = the wallet a line is about (a connected wallet's loan, not the bot's own). The page filters on it. */
  log(level: Level, text: string, txs?: TxRef[], who?: string) {
    const entry: LogEntry = { t: Date.now(), level, text, ...(txs?.length ? { txs } : {}), ...(who ? { who: who.toLowerCase() } : {}) };
    this.data.log.unshift(entry);
    if (this.data.log.length > MAX_LOG) this.data.log.length = MAX_LOG;
    const stamp = new Date(entry.t).toISOString().slice(11, 19);
    console.log(`${stamp} [${level}] ${text}${txs?.length ? "  " + txs.map((x) => x.url || x.hash).join("  ") : ""}`);
    this.save();
  }
  recentLog(n = 60) { return this.data.log.slice(0, n); }

  addMove(usdc: number, kind: "repay" | "give_back") {
    this.data.moves.push({ t: Date.now(), usdc, kind });
    this.data.moves = this.data.moves.filter((m) => Date.now() - m.t < DAY);
    this.save();
  }
  movedLast24h() { return this.data.moves.filter((m) => Date.now() - m.t < DAY).reduce((s, m) => s + m.usdc, 0); }

  sample(s: Sample) {
    this.data.samples.push(s);
    const cutoff = Date.now() - DAY;
    if (this.data.samples.length && this.data.samples[0].t < cutoff) this.data.samples = this.data.samples.filter((x) => x.t >= cutoff);
    this.save();
  }
  samplesSince(t: number) { return this.data.samples.filter((s) => s.t >= t); }

  addStream(events: StreamEvent[]) {
    this.data.stream.unshift(...events);
    if (this.data.stream.length > MAX_STREAM) this.data.stream.length = MAX_STREAM;
    this.save();
  }
  recentStream(n = 20) { return this.data.stream.slice(0, n); }

  private save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1000);
  }
  flush() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error("could not save state:", (e as Error).message);
    }
  }
}
