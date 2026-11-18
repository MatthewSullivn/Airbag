// The one number: the chance this loan loses its bitcoin. One figure, one word (safe or at risk), one small line.
import { Spark } from "@/charts/spark";
import { SERIES, STATUS } from "@/charts/xy-chart";
import type { Reading, Sample, Status } from "@/lib/api";
import { dayET, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Count, Panel, StatusPill } from "./bits";

export function NumberCard({ status, reading, samples, footer, className }: {
  status: Status;
  reading: Reading | null;
  samples: Sample[];
  /** One link or line under the number, e.g. "Where does this come from?" */
  footer?: React.ReactNode;
  className?: string;
}) {
  const limit = status.limit;
  const r = reading;
  const odds = r?.decision.odds ?? null;
  const ladder = r ? r.ladders.find((l) => l.ticker === r.odds?.ticker) ?? r.ladders[0] : undefined;
  const overOdds = odds != null && odds > limit;
  const lowHealth = !!r && r.health < status.rule.actBelowHealth;
  const danger = overOdds || lowHealth;
  const history = samples.map((s) => s.odds).filter((v): v is number => v != null);
  const waiting = !r ? (status.bot.noLoan ? "No loan yet" : status.bot.syncing ? "Updating…" : "Reading…") : null;
  const share = odds == null ? 0 : Math.min(1, odds / (limit * 4));

  return (
    <Panel tone={danger ? "critical" : null} className={className} aria-label="Chance of losing the bitcoin">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[16px] font-medium text-on-panel-2">Chance of losing the bitcoin</p>
        {ladder && <p className="shrink-0 text-[14px] text-on-panel-faint">by {dayET(ladder.expiryDate)}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <p className={cn("figure text-[6.5rem] transition-colors duration-500 sm:text-[8.5rem]", danger ? "text-[#ff6b5e]" : "text-on-panel")} aria-live="polite">
          {odds == null ? "–" : <Count value={odds} format={pct} />}
        </p>
        <div className="mb-3">
          {waiting ? <StatusPill tone="neutral">{waiting}</StatusPill> : danger ? <StatusPill tone="critical">At risk</StatusPill> : odds == null ? <StatusPill tone="neutral">No odds right now</StatusPill> : <StatusPill tone="good">Safe</StatusPill>}
        </div>
      </div>

      {/* a flat line near zero says nothing, so the small chart only shows once the number has moved */}
      {history.length > 2 && Math.max(...history) - Math.min(...history) >= limit * 0.02 && (
        <div className="mt-5">
          <Spark values={history} color={SERIES.s1} floor={0} ceiling={limit} height={64} label={`The chance over time. Now ${pct(odds)}. Airbag steps in at ${pct(limit)}.`} />
        </div>
      )}

      {odds != null && (
        <div className="mt-5" role="img" aria-label={`${pct(odds)} against a limit of ${pct(limit)}`}>
          <div className="relative h-2 rounded-full" style={{ background: danger ? "#4a1d1b" : "#1b2b1b" }}>
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(share * 100, 1.5)}%`, background: danger ? STATUS.critical : STATUS.good }} />
            <span aria-hidden="true" className="absolute left-1/4 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-on-panel" />
          </div>
          <p className="relative mt-2 h-5 text-[14px] text-on-panel-faint">
            <span className="absolute left-1/4 -translate-x-1/2 whitespace-nowrap">Airbag steps in at {pct(limit)}</span>
          </p>
        </div>
      )}

      {footer && <div className="mt-auto pt-6"><div className="border-t border-panel-line pt-4 text-[15px] text-on-panel-2">{footer}</div></div>}
    </Panel>
  );
}
