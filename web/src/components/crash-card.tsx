// "Why": the February 2026 crash, run through the bot's own rule on real bitcoin prices (replay/results.json).
// One picture: the price falls through a loan that was left alone, and stays above the one Airbag looked after.
import { useMemo } from "react";
import { XYChart, SERIES } from "@/charts/xy-chart";
import type { CrashReplay } from "@/lib/api";
import { dayUTC, usd, usdK } from "@/lib/format";
import { Panel } from "./bits";

export function CrashCard({ replay, className }: { replay: CrashReplay | null; className?: string }) {
  const chart = useMemo(() => {
    if (!replay) return null;
    const days = replay.chart;
    const U = replay.headline.untouched;
    const liq = U.liquidation;
    const xs = days.map((d) => Date.parse(d.date + "T00:00:00Z"));
    const liqT = liq ? Date.parse(liq.date + "T00:00:00Z") : Infinity;
    const lows = days.map((d) => d.low);
    const alone = days.map((d, i) => (xs[i] <= liqT ? d.untouchedLine0 : null));
    const airbag = days.map((d) => d.airbagLine);
    const all = [...lows, ...airbag, U.line0];
    const y0 = Math.floor(Math.min(...all) / 10_000) * 10_000 - 10_000, y1 = Math.ceil(Math.max(...all) / 10_000) * 10_000;
    const yTicks: number[] = [];
    for (let v = y0 + 10_000; v <= y1; v += 20_000) yTicks.push(v);
    const xTicks = ["2026-01-15", "2026-02-01", "2026-02-15", "2026-03-01", "2026-03-15"].map((d) => Date.parse(d + "T00:00:00Z")).filter((t) => t >= xs[0] && t <= xs[xs.length - 1]);
    return { days, xs, lows, alone, airbag, liq, liqT, U, y0, y1, yTicks, xTicks };
  }, [replay]);

  if (!replay || !chart) return <Panel className={className}><p className="py-16 text-center text-on-panel-faint">Loading the replay…</p></Panel>;
  const { liq, U } = chart;
  const A = replay.headline.intraday;
  const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <Panel className={className} aria-label="The February 2026 crash">
      <XYChart
        xs={chart.xs}
        series={[
          { key: "low", label: "Bitcoin's price (daily low)", color: SERIES.s2, values: chart.lows },
          { key: "airbag", label: "Lost below this, with Airbag", color: SERIES.s3, values: chart.airbag, curve: "step" },
          { key: "alone", label: "Lost below this, left alone", color: SERIES.s1, values: chart.alone },
        ]}
        yDomain={[chart.y0, chart.y1]}
        yTicks={chart.yTicks}
        xTicks={chart.xTicks}
        yFormat={usdK}
        xFormat={day}
        markers={liq ? [{ x: chart.liqT, y: U.line0, color: SERIES.s1, shape: "cross", label: `sold off ${dayUTC(liq.date)}` }] : []}
        tip={(i) => ({
          title: new Date(chart.xs[i]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
          rows: [
            { label: "Bitcoin's low", value: usd(chart.lows[i]), color: SERIES.s2 },
            { label: "With Airbag", value: usd(chart.airbag[i]), color: SERIES.s3 },
            { label: "Left alone", value: chart.alone[i] != null ? usd(chart.alone[i]) : "sold off", color: SERIES.s1 },
          ],
        })}
        height={260}
        padRight={20}
        ariaLabel={`Bitcoin's daily low against two loans from ${dayUTC(chart.days[0].date)} to ${dayUTC(chart.days[chart.days.length - 1].date)}. The loan left alone is sold off on ${liq ? dayUTC(liq.date) : "no date"}. The loan with Airbag survives.`}
        table={{
          head: ["Date", "Bitcoin's low", "Left alone", "With Airbag", "Savings in the loan"],
          rows: chart.days.map((d, i) => [d.date, usd(d.low), chart.alone[i] != null ? usd(chart.alone[i]) : "sold off", usd(d.airbagLine), usd(d.inLoan)]),
        }}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-panel-line p-5">
          <p className="flex items-center gap-2 text-[16px] text-on-panel-2"><span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: SERIES.s1 }} />Left alone</p>
          <p className="figure mt-3 text-[3.4rem] text-on-panel">{liq ? `${liq.btcKept.toFixed(2)} BTC` : "1 BTC"}</p>
          <p className="mt-2 text-[15px] text-on-panel-faint">{liq ? `left of 1. Sold off on ${dayUTC(liq.date)}.` : "kept."}</p>
        </div>
        <div className="rounded-2xl border border-panel-line bg-panel-2 p-5">
          <p className="flex items-center gap-2 text-[16px] text-on-panel-2"><span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: SERIES.s3 }} />With Airbag</p>
          <p className="figure mt-3 text-[3.4rem] text-on-panel">{A.liquidated ? "sold off" : "1 BTC"}</p>
          <p className="mt-2 text-[15px] text-on-panel-faint">{A.liquidated ? "" : "kept. All of it."}</p>
        </div>
      </div>
    </Panel>
  );
}
