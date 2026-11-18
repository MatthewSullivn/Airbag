// What a loan's cards show right now. Usually that is the live reading. But an alarm must be seen: the bot can
// answer a danger within a second, faster than anyone can read "At risk". So once a loan is at risk, its cards
// keep showing the danger (the highest chance read, and the price line as it was then) for at least three
// seconds, both cards together. The log underneath keeps the true times.
import { useEffect, useRef, useState } from "react";
import type { LogEntry, Reading, Status } from "@/lib/api";

const MIN_ALARM_MS = 3000;

export interface LoanView {
  /** Show the loan as at risk: it is, or it was a moment ago and the alarm is still held on screen. */
  danger: boolean;
  /** The chance to show: the live one, or the highest one read during the alarm. */
  odds: number | null;
  /** The price below which the bitcoin is lost, to show: the live one, or the one at the danger. */
  line: number | null;
  /**
   * A reading worth keeping on the chart of the last hour: a danger the bot really read. The bot only stores a
   * sample every 15 s, so a danger that lasted three seconds would otherwise leave no mark. Not set while the
   * alarm is only being held on screen: that is a display choice, not a reading.
   */
  mark: { t: number; odds: number | null; line: number } | null;
}
interface Danger { odds: number | null; line: number; t?: number }

/**
 * The bot's latest save, while it is fresh, read from its own log line:
 * "Odds hit 45.6% (limit 5%). Moved 0.77 USDC from savings into the loan in 0.4 s. Line is now $49,948."
 */
function freshSave(actions: LogEntry[], now: number): { t: number; odds: number; moved: number } | null {
  const last = actions.find((e) => e.level === "action");
  if (!last || now - last.t > 10_000 || /dry run/.test(last.text) || !/into the loan/.test(last.text)) return null;
  const hit = last.text.match(/^Odds hit (\d+(?:\.\d+)?)%/), moved = last.text.match(/Moved (\d+(?:\.\d+)?) USDC/);
  return hit && moved ? { t: last.t, odds: Number(hit[1]) / 100, moved: Number(moved[1]) } : null;
}

/** `actions` are Airbag's moves for this loan, newest first. */
export function useLoanView(status: Status | null, reading: Reading | null, actions: LogEntry[]): LoanView {
  const live = reading?.decision.odds ?? null;
  const line = reading?.line ?? null;
  const inDanger = !!status && !!reading && ((live != null && live > status.limit) || reading.health < status.rule.actBelowHealth);

  // 1. The page read the danger itself: keep the worst of it on screen until the alarm has lasted long enough.
  const since = useRef<number | null>(null);
  const worst = useRef<Danger | null>(null);
  const [held, setHeld] = useState<Danger | null>(null);
  useEffect(() => {
    if (inDanger && line != null) {
      if (since.current == null) since.current = Date.now();
      if (!worst.current || (live ?? 0) >= (worst.current.odds ?? 0)) worst.current = { odds: live, line };
      setHeld(worst.current);
      return;
    }
    if (since.current == null) return;
    const end = () => { since.current = null; worst.current = null; setHeld(null); };
    const left = MIN_ALARM_MS - (Date.now() - since.current);
    if (left <= 0) { end(); return; }
    const timer = setTimeout(end, left);
    return () => clearTimeout(timer);
  }, [inDanger, live, line]);

  // 2. The bot answered between two reads, so the page never saw the danger at all. Show it anyway, from the
  //    bot's own log line: the chance it acted on, and the line as it was before the money it moved.
  const save = status ? freshSave(actions, status.now) : null;
  const saveT = save?.t ?? null;
  const ringing = inDanger || held != null;
  const seenSave = useRef<number | null | undefined>(undefined);
  const [missed, setMissed] = useState<Danger | null>(null);
  useEffect(() => {
    if (seenSave.current === undefined) { seenSave.current = saveT; return; }   // a save from before the page opened stays quiet
    if (saveT == null || saveT === seenSave.current) return;
    seenSave.current = saveT;
    if (ringing || !save || !reading || !status) return;                        // ringing: the page saw this one itself
    const before = (reading.loan.debt + save.moved) / (reading.loan.collateral * status.lltv);
    setMissed({ odds: save.odds, line: Number.isFinite(before) ? before : reading.line, t: save.t });
    // only when a new save arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveT]);
  useEffect(() => {
    if (!missed) return;
    const timer = setTimeout(() => setMissed(null), MIN_ALARM_MS);
    return () => clearTimeout(timer);
  }, [missed]);

  if (inDanger && line != null && status) return { danger: true, odds: live, line, mark: { t: status.now, odds: live, line } };
  if (held) return { danger: true, odds: held.odds, line: held.line, mark: null };
  if (missed) return { danger: true, odds: missed.odds, line: missed.line, mark: missed.t != null ? { t: missed.t, odds: missed.odds, line: missed.line } : null };
  return { danger: false, odds: live, line, mark: null };
}
