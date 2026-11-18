// The Market screen's second picture: the odds over time. Two views of it:
//   the market   Gemini's own hourly history for one bet (its last traded price), so you see the market move
//   this loan    the chance this loan loses its bitcoin, as the bot read it, with the bot's moves marked
import { useMemo, useState } from "react";
import { worthDrawing } from "@history";
import { XYChart, SERIES, STATUS, timeTicks } from "@/charts/xy-chart";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { niceTicks } from "@/lib/chart-kit";
import type { LogEntry, MarketHistory, Sample } from "@/lib/api";
import { clock, dayET, hhmm, pct, usd } from "@/lib/format";
import { Panel } from "./bits";

const DAY = 86_400_000;
const strikeK = (v: number) => `$${+(v / 1000).toFixed(1)}K`;
const dayHour = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const dayOnly = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const SWITCH = "border-panel-line bg-panel-2 [&_button]:text-on-panel-faint [&_button[aria-checked=true]]:text-on-panel";

/** Gemini's own history for one bet: the chance bitcoin ends below that price, as last traded, hour by hour. */
function MarketOverTime({ history, spot }: { history: MarketHistory; spot: number | null }) {
  // the four bets nearest bitcoin's price that have really traded, shown low to high; the nearest one first
  const near = useMemo(() => worthDrawing(history.series, spot, { max: 4 }), [history, spot]);
  const picks = useMemo(() => [...near].sort((a, b) => a.strike - b.strike), [near]);
  const first = near[0]?.strike ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const bet = picks.find((p) => p.strike === (picked ?? first)) ?? picks[0];
  const date = dayET(history.expiryDate);

  const chart = useMemo(() => {
    if (!bet) return null;
    const xs = bet.points.map((p) => p[0]);
    const below = bet.points.map((p) => 1 - p[1]);
    const from = xs[0], to = xs[xs.length - 1];
    const every = to - from > 9 * DAY ? 2 * DAY : DAY;
    const xTicks: number[] = [];
    // a label at each local midnight
    const start = new Date(from);
    start.setHours(24, 0, 0, 0);
    for (let t = start.getTime(); t <= to; t += every) xTicks.push(t);
    const traded = bet.points.map((p, i) => ({ i, v: p[2] })).filter((p) => p.v > 0);
    return { xs, below, xTicks, traded, last: below[below.length - 1], low: Math.min(...below), high: Math.max(...below) };
  }, [bet]);

  if (!bet || !chart) {
    return <p className="py-16 text-center text-[15px] text-on-panel-faint">No bet on this date has traded twice yet, so there is no history to draw.</p>;
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-[40ch] text-[15px] leading-snug text-on-panel-2">
          Chance bitcoin ends below <strong className="font-semibold text-on-panel">{usd(bet.strike)}</strong> by {date}, as traded on Gemini. Each dot is an hour with trades.
        </p>
        {picks.length > 1 && (
          <SegmentedControl aria-label="Which bet" size="sm" value={String(bet.strike)} onValueChange={(v) => setPicked(Number(v))} options={picks.map((p) => ({ value: String(p.strike), label: strikeK(p.strike) }))} className={SWITCH} pillColor="#33332f" />
        )}
      </div>
      <XYChart
        xs={chart.xs}
        series={[{ key: "below", label: `Chance bitcoin ends below ${usd(bet.strike)}`, color: SERIES.s2, values: chart.below, fill: "dots", curve: "step", endLabel: pct(chart.last) }]}
        yDomain={[0, 1]}
        yTicks={[0, 0.5, 1]}
        xTicks={chart.xTicks}
        yFormat={(v) => `${Math.round(v * 100)}%`}
        xFormat={dayOnly}
        markers={chart.traded.map((p) => ({ x: chart.xs[p.i], y: chart.below[p.i], color: SERIES.s2, shape: "tick" as const }))}
        tip={(i) => ({
          title: dayHour(chart.xs[i]),
          rows: [{ label: `ends below ${usd(bet.strike)}`, value: pct(chart.below[i]), color: SERIES.s2 }],
          note: bet.points[i][2] > 0 ? `${+bet.points[i][2].toFixed(2)} contracts traded this hour` : "no trades this hour",
        })}
        height={230}
        padRight={48}
        ariaLabel={`Gemini's market, hour by hour since ${dayOnly(chart.xs[0])}: the chance bitcoin ends below ${usd(bet.strike)} by ${date} moved between ${pct(chart.low)} and ${pct(chart.high)}. Now ${pct(chart.last)}.`}
        table={{ head: ["Hour", `Ends below ${usd(bet.strike)}`, "Contracts traded"], rows: bet.points.slice().reverse().map((p) => [dayHour(p[0]), pct(1 - p[1]), p[2] > 0 ? String(+p[2].toFixed(2)) : "–"]) }}
      />
    </>
  );
}

/** This loan's own number over time, with the limit and the bot's moves. */
function LoanOverTime({ samples, actions, limit, ofWallet }: { samples: Sample[]; actions: LogEntry[]; limit: number; ofWallet: boolean }) {
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
      pts, xs, vals, ticks, xTicks, short: xs[xs.length - 1] - xs[0] < 5 * 60_000,
      markers: inWindow.map((a) => ({ x: xs[nearestIdx(a.t)], y: vals[nearestIdx(a.t)], color: SERIES.s1 })),
      tip: (i: number) => {
        const p = pts[i];
        const act = inWindow.find((a) => nearestIdx(a.t) === i);
        return { title: clock(p.t), rows: [{ label: "chance", value: pct(p.odds), color: SERIES.s1 }], note: act ? act.text : `bitcoin ${usd(p.btc)}` };
      },
    };
  }, [samples, actions, limit]);

  return (
    <>
      <p className="mb-5 max-w-[40ch] text-[15px] leading-snug text-on-panel-2">
        The chance this loan loses its bitcoin, {ofWallet ? "since you connected" : "over the last hour"}. Each dot is a move by Airbag.
      </p>
      {chart ? (
        <XYChart
          xs={chart.xs}
          series={[{ key: "odds", label: "Chance of losing the bitcoin", color: SERIES.s1, values: chart.vals, fill: "dots" }]}
          yDomain={[0, chart.ticks[chart.ticks.length - 1]]}
          yTicks={chart.ticks}
          xTicks={chart.xTicks}
          yFormat={(v) => `${+(v * 100).toFixed(1)}%`}
          xFormat={chart.short ? clock : hhmm}
          refs={[{ y: limit, label: `Airbag steps in at ${pct(limit)}`, color: STATUS.critical, labelAt: "start" }]}
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
    </>
  );
}

export function OverTime({ history, spot, samples, actions, limit, ofWallet }: {
  /** Gemini's hourly history for the ladder on screen; null while it loads or if Gemini has none. */
  history: MarketHistory | null;
  spot: number | null;
  samples: Sample[];
  actions: LogEntry[];
  limit: number;
  ofWallet: boolean;
}) {
  const hasMarket = !!history && history.series.length > 0;
  // if Airbag has just moved, that is what people came to see; otherwise the market, which moves by itself
  const [view, setView] = useState<"market" | "loan">(() => (actions.length ? "loan" : "market"));
  const shown = view === "market" && !hasMarket && history ? "loan" : view;
  return (
    <Panel aria-label="The odds over time">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-[1.25rem] font-semibold tracking-tight text-on-panel">The odds, over time</p>
        <SegmentedControl
          aria-label="Whose odds"
          size="sm"
          value={shown}
          onValueChange={(v) => setView(v as "market" | "loan")}
          options={[{ value: "market", label: "The market" }, { value: "loan", label: "This loan" }]}
          className={SWITCH}
          pillColor="#33332f"
        />
      </div>
      {shown === "market" ? (
        history ? <MarketOverTime history={history} spot={spot} /> : <p className="py-16 text-center text-[15px] text-on-panel-faint">Reading Gemini's history…</p>
      ) : (
        <LoanOverTime samples={samples} actions={actions} limit={limit} ofWallet={ofWallet} />
      )}
    </Panel>
  );
}
