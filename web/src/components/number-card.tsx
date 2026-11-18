// The one number: the chance this loan loses its bitcoin. One figure, one word (safe or at risk), one small line.
import { useEffect, useState } from "react";
import { Spark } from "@/charts/spark";
import { SERIES, STATUS } from "@/charts/xy-chart";
import type { LogEntry, Reading, Sample, Status } from "@/lib/api";
import { dayET, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Count, Panel, StatusPill } from "./bits";

/** True at once, false only after a short wait: the red state stays until the falling number has reached its new value. */
function useLinger(on: boolean, ms: number) {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) { setHeld(true); return; }
    const t = setTimeout(() => setHeld(false), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return on || held;
}

/**
 * For half a minute after the bot moves money, the badge says what it just did instead of plain "Safe".
 * The bot writes "... from savings into the loan ..." for a save; its other move is the give-back.
 */
export function recentMove(log: LogEntry[], now: number): string | null {
  const last = log.find((e) => e.level === "action");
  if (!last || now - last.t > 30_000 || /dry run/.test(last.text)) return null;
  return /into the loan/.test(last.text) ? "Saved by Airbag" : "Savings returned";
}

export function NumberCard({ status, reading, samples, footer, pending, justNow, className }: {
  status: Status;
  reading: Reading | null;
  samples: Sample[];
  /** One link or line under the number, e.g. "Where does this come from?" */
  footer?: React.ReactNode;
  /** Something was just pressed and the chain has not answered yet, e.g. "Pushing the loan…" */
  pending?: string | null;
  /** What the bot did a moment ago, e.g. "Saved by Airbag". Replaces "Safe" for a short while. */
  justNow?: string | null;
  className?: string;
}) {
  const limit = status.limit;
  const r = reading;
  const odds = r?.decision.odds ?? null;
  const ladder = r ? r.ladders.find((l) => l.ticker === r.odds?.ticker) ?? r.ladders[0] : undefined;
  const overOdds = odds != null && odds > limit;
  const lowHealth = !!r && r.health < status.rule.actBelowHealth;
  // the number glides down over 0.6 s (Count), so "Safe" waits for it instead of jumping ahead
  const danger = useLinger(overOdds || lowHealth, 650);
  const history = samples.map((s) => s.odds).filter((v): v is number => v != null);
  const waiting = !r ? (status.bot.noLoan ? "No loan yet" : status.bot.syncing ? "Updating…" : "Reading…") : null;
  const share = odds == null ? 0 : Math.min(1, odds / (limit * 4));
  const estimated = r?.odds?.source === "estimated";

  return (
    <Panel tone={danger ? "critical" : null} className={className} aria-label="Chance of losing the bitcoin">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[16px] font-medium text-on-panel-2">Chance of losing the bitcoin</p>
        {ladder && (
          <p className="shrink-0 text-right text-[14px] text-on-panel-faint">
            by {dayET(ladder.expiryDate)}
            {estimated && <span title="Gemini has no bet this low, so Airbag extends the market's curve."> · estimated</span>}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <p className={cn("figure text-[6.5rem] transition-colors duration-500 sm:text-[8.5rem]", danger ? "text-[#ff6b5e]" : "text-on-panel")} aria-live="polite">
          {odds == null ? "–" : <Count value={odds} format={pct} />}
        </p>
        <div className="mb-3" role="status">
          {waiting ? <StatusPill tone="neutral">{waiting}</StatusPill>
            : danger ? <StatusPill tone="critical">At risk</StatusPill>
            : pending ? <span className="inline-block animate-pulse"><StatusPill tone="neutral">{pending}</StatusPill></span>
            : odds == null ? <StatusPill tone="neutral">No odds right now</StatusPill>
            : <StatusPill tone="good">{justNow ?? "Safe"}</StatusPill>}
        </div>
      </div>

      <div className="mt-auto pt-8">
      {/* a flat line near zero says nothing, so the small chart only shows once the number has moved */}
      {history.length > 2 && Math.max(...history) - Math.min(...history) >= limit * 0.02 && (
        <div className="mb-5">
          <Spark values={history} color={SERIES.s1} floor={0} ceiling={limit} height={64} label={`The chance over time. Now ${pct(odds)}. Airbag steps in at ${pct(limit)}.`} />
        </div>
      )}

      {odds != null && (
        <div role="img" aria-label={`${pct(odds)} against a limit of ${pct(limit)}`}>
          <div className="relative h-2 rounded-full" style={{ background: danger ? "#4a1d1b" : "#1b2b1b" }}>
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(share * 100, 1.5)}%`, background: danger ? STATUS.critical : STATUS.good }} />
            <span aria-hidden="true" className="absolute left-1/4 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-on-panel" />
          </div>
          <p className="relative mt-2 h-5 text-[14px] text-on-panel-faint">
            <span className="absolute left-1/4 -translate-x-1/2 whitespace-nowrap">Airbag steps in at {pct(limit)}</span>
          </p>
        </div>
      )}

      {footer && <div className="mt-6 border-t border-panel-line pt-4 text-[15px] text-on-panel-2">{footer}</div>}
      </div>
    </Panel>
  );
}
