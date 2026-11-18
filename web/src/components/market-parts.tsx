// The Market screen's second picture: how the chance has moved, with the limit and the bot's moves marked.
import { useMemo } from "react";
import { XYChart, SERIES, STATUS, timeTicks } from "@/charts/xy-chart";
import { niceTicks } from "@/lib/chart-kit";
import type { LogEntry, Sample } from "@/lib/api";
import { clock, hhmm, pct, usd } from "@/lib/format";
import { Panel } from "./bits";

export function OddsHistory({ samples, actions, limit, ofWallet }: { samples: Sample[]; actions: LogEntry[]; limit: number; ofWallet: boolean }) {
  const chart = useMemo(() => {
    const pts = samples.filter((p) => p.odds != null);
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.t);
    const vals = pts.map((p) => p.odds as number);
    const top = Math.max(limit * 2, ...vals.map((v) => v * 1.15));
    const ticks = niceTicks(0, Math.min(1, top), 4).filter((t) => t <= 1);
    const xTicks = timeTicks(xs[0], xs[xs.length - 1], 6);
    const inWindow = actions.filter((a) => a.t >= xs[0] && a.t <= xs[xs.length - 1] + 5000);
    const nearestIdx = (t: number) => xs.reduce((best, x, i) => (Math.abs(x - t) < Math.abs(xs[best] - t) ? i : best), 0);
    return {
      pts, xs, vals, ticks, xTicks,
      markers: inWindow.map((a) => ({ x: xs[nearestIdx(a.t)], y: vals[nearestIdx(a.t)], color: SERIES.s1 })),
      tip: (i: number) => {
        const p = pts[i];
        const act = inWindow.find((a) => nearestIdx(a.t) === i);
        return { title: clock(p.t), rows: [{ label: "chance", value: pct(p.odds), color: SERIES.s1 }], note: act ? act.text : `bitcoin ${usd(p.btc)}` };
      },
    };
  }, [samples, actions, limit]);

  return (
    <Panel aria-label="The chance over time">
      <p className="mb-6 text-[16px] font-medium text-on-panel-2">
        The chance of losing the bitcoin, {ofWallet ? "since you connected" : "over the last hour"}. Each dot is a move by Airbag.
      </p>
      {chart ? (
        <XYChart
          xs={chart.xs}
          series={[{ key: "odds", label: "Chance of losing the bitcoin", color: SERIES.s1, values: chart.vals, fill: "dots" }]}
          yDomain={[0, chart.ticks[chart.ticks.length - 1]]}
          yTicks={chart.ticks}
          xTicks={chart.xTicks}
          yFormat={(v) => `${+(v * 100).toFixed(1)}%`}
          xFormat={hhmm}
          refs={[{ y: limit, label: `Airbag steps in at ${pct(limit)}`, color: STATUS.critical }]}
          markers={chart.markers}
          tip={chart.tip}
          pulse
          height={230}
          padRight={18}
          ariaLabel={`The chance over time. Now ${pct(chart.vals[chart.vals.length - 1])}. Airbag steps in at ${pct(limit)}. ${chart.markers.length} moves marked.`}
          table={{ head: ["Time", "Chance", "How", "Lost below", "Bitcoin"], rows: chart.pts.slice().reverse().map((p) => [clock(p.t), pct(p.odds), p.source ?? "–", usd(p.line), usd(p.btc)]) }}
        />
      ) : (
        <p className="py-16 text-center text-[15px] text-on-panel-faint">Collecting readings. One every few seconds.</p>
      )}
    </Panel>
  );
}
