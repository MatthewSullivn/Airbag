// "What is my loan up to": bitcoin's price and the price below which the bitcoin is lost. Two numbers and one picture.
import { useMemo } from "react";
import { XYChart, SERIES, timeTicks } from "@/charts/xy-chart";
import type { Reading, Sample, Status } from "@/lib/api";
import { clock, hhmm, usd, usdK } from "@/lib/format";
import { Count, Panel, StatusPill } from "./bits";

export function PriceCard({ status, reading, samples, className }: { status: Status; reading: Reading | null; samples: Sample[]; className?: string }) {
  const r = reading;
  const chart = useMemo(() => {
    if (!r) return null;
    let pts = samples.filter((p) => p.btc != null && p.line != null);
    // a loan we have only just started watching still gets its picture: a flat minute up to now
    if (pts.length < 2) pts = [{ t: r.at - 60_000, btc: r.priceUsed, line: r.line, odds: null, source: null, health: r.health }, { t: r.at, btc: r.priceUsed, line: r.line, odds: null, source: null, health: r.health }];
    const xs = pts.map((p) => p.t);
    const price = pts.map((p) => p.btc as number);
    const line = pts.map((p) => p.line as number);
    // the scale hugs the price and the line, because the picture is the gap between them
    const hiData = Math.max(...price, ...line), loData = Math.min(...price, ...line);
    const gap = Math.max(hiData - loData, hiData * 0.04);
    const lo = loData - gap * 0.45, hi = hiData + gap * 0.3;
    const step = hi - lo > 30_000 ? 10_000 : hi - lo > 12_000 ? 5_000 : hi - lo > 5_000 ? 2_500 : 1_000;
    const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    const yTicks: number[] = [];
    for (let v = y0; v <= y1; v += step) yTicks.push(v);
    const xTicks = timeTicks(xs[0], xs[xs.length - 1]);
    // the lowest the line can go if every dollar of savings went into the loan
    const savings = r.savings?.balance ?? 0;
    const reach = Math.max(0, (r.loan.debt - savings) / (r.loan.collateral * status.lltv));
    return { pts, xs, price, line, y0, y1, yTicks, xTicks, savings, reach };
  }, [r, samples, status.lltv]);

  if (!r || !chart) {
    return (
      <Panel className={className}>
        <p className="text-[16px] font-medium text-on-panel-2">Bitcoin and the loan</p>
        <p className="figure mt-4 text-[4rem] text-on-panel">–</p>
      </Panel>
    );
  }
  const room = (r.priceUsed - r.line) / r.priceUsed;
  const danger = r.health < status.rule.actBelowHealth || (r.decision.odds != null && r.decision.odds > status.limit);
  const lineNow = chart.line[chart.line.length - 1];

  return (
    <Panel className={className} aria-label="Bitcoin's price and the price where the bitcoin is lost">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="flex items-center gap-2 text-[16px] font-medium text-on-panel-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: SERIES.s2 }} /> Bitcoin now
          </p>
          <p className="figure mt-3 text-[3.2rem] text-on-panel sm:text-[4.2rem]"><Count value={r.priceUsed} format={usd} /></p>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[16px] font-medium text-on-panel-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: SERIES.s1 }} /> You lose it below
          </p>
          <p className="figure mt-3 text-[3.2rem] text-on-panel sm:text-[4.2rem]"><Count value={r.line} format={usd} /></p>
        </div>
      </div>

      <div className="mt-6">
        <XYChart
          xs={chart.xs}
          series={[
            { key: "btc", label: "Bitcoin's price", color: SERIES.s2, values: chart.price },
            { key: "line", label: "You lose it below", color: SERIES.s1, values: chart.line, curve: "step" },
          ]}
          yDomain={[chart.y0, chart.y1]}
          yTicks={chart.yTicks}
          xTicks={chart.xTicks}
          yFormat={usdK}
          xFormat={hhmm}
          tip={(i) => ({
            title: clock(chart.pts[i].t),
            rows: [
              { label: "Bitcoin", value: usd(chart.price[i]), color: SERIES.s2 },
              { label: "You lose it below", value: usd(chart.line[i]), color: SERIES.s1 },
            ],
          })}
          height={190}
          hideLegend
          ariaLabel={`Bitcoin's price is ${usd(r.priceUsed)}. The bitcoin is lost if it falls below ${usd(lineNow)}.`}
          table={{ head: ["Time", "Bitcoin", "You lose it below"], rows: chart.pts.slice().reverse().map((p) => [clock(p.t), usd(p.btc), usd(p.line)]) }}
        />
      </div>

      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-panel-line pt-4 text-[16px] text-on-panel">
        <StatusPill tone={danger ? "critical" : "good"} small>{danger ? "Too close" : "Room to fall"}</StatusPill>
        Bitcoin can fall <strong className="font-semibold">{(room * 100).toFixed(1)}%</strong> before you lose it.
      </p>
    </Panel>
  );
}
