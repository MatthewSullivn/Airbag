// The one number: the chance this loan loses its bitcoin. One figure, one word (safe or at risk), and one small
// chart: the chance over the last hour against the level where Airbag steps in.
import { Spark } from "@/charts/spark";
import { SERIES } from "@/charts/xy-chart";
import type { LogEntry, Reading, Sample, Status } from "@/lib/api";
import { dayET, pct } from "@/lib/format";
import type { LoanView } from "@/lib/loan-view";
import { cn } from "@/lib/utils";
import { Count, Panel, StatusPill } from "./bits";

const ALARM = "#ff6b5e";
const LEVEL = "#a3a299";

/**
 * For half a minute after the bot moves money, the badge says what it just did instead of plain "Safe".
 * The bot writes "... from savings into the loan in 0.4 s ..." for a save; its other move is the give-back.
 */
export function recentMove(log: LogEntry[], now: number): string | null {
  const last = log.find((e) => e.level === "action");
  if (!last || now - last.t > 30_000 || /dry run/.test(last.text)) return null;
  if (!/into the loan/.test(last.text)) return "Savings returned";
  const took = last.text.match(/\bin (\d+(?:\.\d+)?) s\b/);
  return took ? `Saved by Airbag in ${took[1]} s` : "Saved by Airbag";
}

export function NumberCard({ status, reading, samples, view, footer, pending, justNow, beam, compact, className }: {
  status: Status;
  reading: Reading | null;
  samples: Sample[];
  /** What to show right now: the live reading, or a danger held on screen long enough to be seen (lib/loan-view). */
  view: LoanView;
  /** One link or line under the chart, e.g. "Where does this come from?" */
  footer?: React.ReactNode;
  /** Something was just pressed and the chain has not answered yet, e.g. "Pushing the loan…" */
  pending?: string | null;
  /** What the bot did a moment ago, e.g. "Saved by Airbag in 0.4 s". Replaces "Safe" for a short while. */
  justNow?: string | null;
  /** A slow beam of light round the card while it is calm. */
  beam?: boolean;
  /** A smaller figure and chart: this card is one of several on a screen that shows a whole loan at once. */
  compact?: boolean;
  className?: string;
}) {
  const limit = status.limit;
  const r = reading;
  const ladder = r ? r.ladders.find((l) => l.ticker === r.odds?.ticker) ?? r.ladders[0] : undefined;
  const danger = view.danger;
  const odds = view.odds;
  // The line ends at this very moment. The bot only keeps a sample every 15 s, so without the last point a
  // danger would show on the big number and not on the chart.
  const history = samples.map((s) => s.odds).filter((v): v is number => v != null);
  const trace = odds != null ? [...history, odds] : history;
  const waiting = !r ? (status.bot.noLoan ? "No loan yet" : status.bot.syncing ? "Updating…" : "Reading…") : null;
  const estimated = !danger && r?.odds?.source === "estimated";

  return (
    <Panel tone={danger ? "critical" : null} beam={beam} className={cn(compact && "sm:p-6", className)} aria-label="Chance of losing the bitcoin">
      {/* on a narrow card the date drops under the label instead of squeezing it into three lines */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="text-[16px] font-medium text-on-panel-2">Chance of losing the bitcoin</p>
        {ladder && (
          <p className="shrink-0 text-right text-[14px] text-on-panel-faint">
            by {dayET(ladder.expiryDate)}
            {estimated && <span title="Gemini has no bet this low, so Airbag extends the market's curve."> · estimated</span>}
          </p>
        )}
      </div>

      <div className={cn("flex flex-wrap items-end", compact ? "mt-3 gap-x-4 gap-y-2" : "mt-4 gap-x-5 gap-y-3")}>
        <p className={cn("figure", compact ? "text-[5.4rem] sm:text-[6rem]" : "text-[6.5rem] sm:text-[8.5rem]", danger ? "text-[#ff6b5e]" : "text-on-panel")} aria-live="polite">
          {/* into and out of the alarm the number jumps (a new Count), so the figure and the badge always agree */}
          {odds == null ? "–" : <Count key={danger ? "alarm" : "calm"} value={odds} format={pct} />}
        </p>
        <div className={compact ? "mb-2" : "mb-3"} role="status">
          {waiting ? <StatusPill tone="neutral">{waiting}</StatusPill>
            : danger ? <StatusPill tone="critical">At risk</StatusPill>
            : pending ? <span className="inline-block animate-pulse"><StatusPill tone="neutral">{pending}</StatusPill></span>
            : odds == null ? <StatusPill tone="neutral">No odds right now</StatusPill>
            : <StatusPill tone="good">{justNow ?? "Safe"}</StatusPill>}
        </div>
      </div>

      <div className={cn("mt-auto", compact ? "pt-5" : "pt-7")}>
        {trace.length > 0 && (
          <>
            <Spark
              values={trace.length > 1 ? trace : [trace[0], trace[0]]}
              color={danger ? ALARM : SERIES.s1}
              floor={0}
              ceiling={limit * 2}
              mark={{ y: limit, color: LEVEL }}
              height={compact ? 64 : 84}
              label={`The chance over the last hour. Now ${pct(odds)}. Airbag steps in at ${pct(limit)}.`}
            />
            <p className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13.5px] text-on-panel-faint">
              <span className="flex items-center gap-2">
                <svg width="20" height="6" aria-hidden="true"><line x1="0" y1="3" x2="20" y2="3" stroke={LEVEL} strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Airbag steps in at {pct(limit)}
              </span>
              <span>the last hour</span>
            </p>
          </>
        )}
        {footer && <div className="mt-5 border-t border-panel-line pt-4 text-[15px] text-on-panel-2">{footer}</div>}
      </div>
    </Panel>
  );
}
