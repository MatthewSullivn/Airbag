// "How much room is there": bitcoin's price, and the price below which the bitcoin is lost. Two numbers and one
// picture: the price line above a shaded floor. When the floor comes up under the price, the loan is at risk.
import { useMemo } from "react";
import { XYChart, SERIES, STATUS, timeTicks } from "@/charts/xy-chart";
import type { Reading, Sample, Status } from "@/lib/api";
import { clock, hhmm, usd, usdK } from "@/lib/format";
import type { LoanView } from "@/lib/loan-view";
import { cn } from "@/lib/utils";
import { Count, Panel, StatusPill } from "./bits";

export function PriceCard({ reading, samples, view, compact, className }: {
  status: Status;
  reading: Reading | null;
  samples: Sample[];
  /** What to show right now: the live reading, or a danger held on screen long enough to be seen (lib/loan-view). */
  view: LoanView;
  /** Smaller figures and a lower chart: this card is one of several on a screen that shows a whole loan at once. */
  compact?: boolean;
  className?: string;
}) {
  const r = reading;
  const line = view.line ?? r?.line ?? null;
  // the two prices shrink with the card (cqw), so they never run into each other
  const PRICE = compact ? "text-[length:min(3.1rem,15.5cqw)]" : "text-[length:min(2.6rem,15.5cqw)] sm:text-[4.2rem]";
  const chart = useMemo(() => {
    if (!r || line == null) return null;
    let pts = samples.filter((p) => p.btc != null && p.line != null);
    // The picture ends at this very moment. The bot only keeps a sample every 15 s, and a danger can be over in 3.
    const now: Sample = { t: r.at, btc: r.priceUsed, line: r.line, odds: null, source: null, health: r.health };
    if (!pts.length || r.at > pts[pts.length - 1].t) pts = [...pts, now];
    // a loan we have only just started watching still gets its picture: a flat minute up to now
    if (pts.length < 2) pts = [{ ...now, t: r.at - 60_000 }, now];
    const xs = pts.map((p) => p.t);
    const price = pts.map((p) => p.btc as number);
    const lines = pts.map((p) => p.line as number);
    // The scale covers everywhere the floor has been in this hour, so it stays put when the floor jumps:
    // the jump is then seen as the floor moving, not as the numbers on the side changing.
    const floorLo = Math.min(...lines, line), top = Math.max(...price, line);
    const span = Math.max(top - floorLo, top * 0.04);
    const lo = floorLo - span * 0.34, hi = top + span * 0.16;
    // few round numbers on the side: about four
    const step = hi - lo > 17_000 ? 10_000 : hi - lo > 8_000 ? 5_000 : hi - lo > 4_000 ? 2_500 : 1_000;
    const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    const yTicks: number[] = [];
    for (let v = y0; v <= y1; v += step) yTicks.push(v);
    const xTicks = timeTicks(xs[0], xs[xs.length - 1]);
    const short = xs[xs.length - 1] - xs[0] < 5 * 60_000;
    return { pts, xs, price, lines, y0, y1, yTicks, xTicks, short };
  }, [r, samples, line]);

  if (!r || !chart || line == null) {
    return (
      <Panel className={className}>
        <p className="text-[16px] font-medium text-on-panel-2">Bitcoin and the loan</p>
        <p className="figure mt-4 text-[4rem] text-on-panel">–</p>
      </Panel>
    );
  }
  const room = Math.max(0, r.priceUsed - line);
  const danger = view.danger;

  return (
    <Panel className={cn(compact && "sm:p-6", className)} aria-label="Bitcoin's price and the price where the bitcoin is lost">
      {/* on a phone the two prices share a narrow row: they shrink with the card (cqw), so they never run into each other */}
      <div className="@container grid grid-cols-2 gap-4 sm:gap-6">
        <div>
          <p className="flex min-h-[2.6em] items-start gap-2 text-[15px] font-medium leading-snug text-on-panel-2 sm:min-h-0 sm:items-center sm:text-[16px]">
            <span aria-hidden="true" className="mt-[0.6em] h-0.5 w-4 shrink-0 rounded sm:mt-0" style={{ background: SERIES.s2 }} /> Bitcoin now
          </p>
          <p className={cn("figure mt-2 text-on-panel", !compact && "sm:mt-3", PRICE)}><Count value={r.priceUsed} format={usd} /></p>
        </div>
        <div>
          <p className="flex min-h-[2.6em] items-start gap-2 text-[15px] font-medium leading-snug text-on-panel-2 sm:min-h-0 sm:items-center sm:text-[16px]">
            <span aria-hidden="true" className="mt-[0.6em] h-0.5 w-4 shrink-0 rounded sm:mt-0" style={{ background: SERIES.s1 }} /> You lose it below
          </p>
          <p className={cn("figure mt-2", !compact && "sm:mt-3", PRICE, danger ? "text-[#ff6b5e]" : "text-on-panel")}><Count value={line} format={usd} /></p>
        </div>
      </div>

      <div className={compact ? "mt-4" : "mt-6"}>
        <XYChart
          xs={chart.xs}
          series={[{ key: "btc", label: "Bitcoin's price", color: SERIES.s2, values: chart.price }]}
          floor={{ y: line, color: SERIES.s1, label: "you lose it down here", strong: danger }}
          gap={{ from: r.priceUsed, to: line, color: danger ? STATUS.critical : STATUS.good, label: usd(room), sub: "room" }}
          yDomain={[chart.y0, chart.y1]}
          yTicks={chart.yTicks}
          xTicks={chart.xTicks}
          yFormat={usdK}
          xFormat={chart.short ? clock : hhmm}
          tip={(i) => ({
            title: clock(chart.pts[i].t),
            rows: [
              { label: "Bitcoin", value: usd(chart.price[i]), color: SERIES.s2 },
              { label: "You lose it below", value: usd(chart.lines[i]), color: SERIES.s1 },
            ],
          })}
          height={compact ? 150 : 190}
          padRight={74}
          pulse
          hideLegend
          ariaLabel={`Bitcoin's price is ${usd(r.priceUsed)}. The bitcoin is lost if it falls below ${usd(line)}. That leaves ${usd(room)} of room.`}
          table={{ head: ["Time", "Bitcoin", "You lose it below"], rows: chart.pts.slice().reverse().map((p) => [clock(p.t), usd(p.btc), usd(p.line)]) }}
        />
      </div>

      <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-panel-line text-on-panel", compact ? "mt-auto pt-3.5 text-[15px]" : "mt-5 pt-4 text-[16px]")}>
        <StatusPill tone={danger ? "critical" : "good"} small>{danger ? "Too close" : "Room to fall"}</StatusPill>
        <span>Bitcoin can fall <strong className="font-semibold">{usd(room)}</strong> before you lose it.</span>
      </p>
    </Panel>
  );
}
