// How numbers and times are written on the page. One place, so every card says them the same way.
export const pct = (x: number | null | undefined) =>
  x == null ? "–" : x > 0 && x < 0.001 ? "<0.1%" : x < 0.1 ? `${+(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`;
export const usd = (x: number | null | undefined) => (x == null ? "–" : `$${Math.round(x).toLocaleString("en-US")}`);
export const usdK = (x: number) => `$${Math.round(x / 1000)}K`;
export const usdc = (x: number | null | undefined, d = 2) =>
  x == null ? "–" : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const btc = (x: number | null | undefined) => (x == null ? "–" : `${+x.toFixed(8)}`);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour12: false });
export const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
export const hhmmss = clock;
export const utcClock = (t: number) => new Date(t).toISOString().slice(11, 19);
export const dayET = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
export const dayUTC = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}

/** Health bands, the same cut-offs Circle's Borrow Kit uses. */
export const BANDS = [
  { min: 1.2, name: "Safe", tone: "good" },
  { min: 1.1, name: "Warn", tone: "warning" },
  { min: 1.05, name: "Urgent", tone: "serious" },
  { min: 1.0, name: "Imminent", tone: "critical" },
  { min: -Infinity, name: "Liquidatable", tone: "critical" },
] as const;
export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";
export const bandOf = (health: number) => BANDS.find((b) => health >= b.min)!;
