// What Gemini's prediction market says, as a picture: for each price, the chance bitcoin ends above it on the date.
// The loan's line is drawn on that curve, so you can see where the one number comes from.
// The numbers use the bot's own maths (src/brain.mjs), not a copy of it.
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { chanceBelowEst } from "@brain";
import { XYChart, SERIES } from "@/charts/xy-chart";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Ladders, Reading } from "@/lib/api";
import { dayET, pct, usd, usdK } from "@/lib/format";
import { Panel } from "./bits";

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

export function LadderCard({ ladders, reading, limit, className }: { ladders: Ladders | null; reading: Reading | null; /** Where Airbag steps in, e.g. 0.05 */ limit?: number; className?: string }) {
  const events = ladders?.events ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const ticker = picked ?? reading?.odds?.ticker ?? events[0]?.ticker;
  const event = events.find((e) => e.ticker === ticker) ?? events[0];
  const line = reading?.line ?? null;
  const spot = reading?.priceUsed ?? ladders?.spot ?? null;

  const chart = useMemo(() => {
    if (!event || event.ladder.length < 2) return null;
    const ladder = [...event.ladder].sort((a, b) => a.strike - b.strike);
    const lowest = ladder[0].strike, highest = ladder[ladder.length - 1].strike;
    const span = highest - lowest;
    const xMin = Math.min(lowest, line ?? lowest) - span * 0.06;
    const xMax = Math.max(highest, spot ?? highest) + span * 0.04;
    // left of the lowest bet nobody quotes a price: the bot fits the ladder's shape and estimates. Drawn dashed.
    const tailXs: number[] = [];
    if (xMin < lowest) for (let i = 0; i < 10; i++) tailXs.push(xMin + ((lowest - xMin) * i) / 10);
    const est = (x: number) => {
      const c = chanceBelowEst(ladder, x);
      return c ? 1 - c.p : null;
    };
    const xs = [...tailXs, ...ladder.map((p) => p.strike)];
    const quoted = [...tailXs.map(() => null), ...ladder.map((p) => p.pAbove)];
    const estimated = [...tailXs.map(est), ladder[0].pAbove, ...ladder.slice(1).map(() => null)];
    const below = line != null ? chanceBelowEst(ladder, line) : null;
    const step = span > 40_000 ? 10_000 : 5_000;
    const xTicks: number[] = [];
    for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) xTicks.push(v);
    return { ladder, lowest, xs, quoted, estimated, hasTail: tailXs.length > 0, xMin, xMax, xTicks, below };
  }, [event, line, spot]);

  const own = reading?.ladders.find((l) => l.ticker === event?.ticker)?.odds ?? null;
  const date = event ? dayET(event.expiryDate) : "";

  return (
    <Panel className={className} aria-label="Gemini's prediction market">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-[1.25rem] font-semibold tracking-tight text-on-panel">Where will bitcoin be{date ? ` on ${date}` : ""}?</p>
          <p className="mt-1 text-[14px] text-on-panel-faint">
            Gemini's prediction market, live
            {event?.volume != null && <> · {usd(event.volume)} traded</>}
            {event?.url && (
              <>
                {" · "}
                <a href={event.url} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-on-panel-2 underline decoration-current/30 underline-offset-[3px] hover:decoration-current">
                  open it on Gemini<ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
              </>
            )}
          </p>
        </div>
        {events.length > 1 && (
          <SegmentedControl
            aria-label="Which date"
            size="sm"
            value={event?.ticker}
            onValueChange={setPicked}
            options={events.map((e) => ({ value: e.ticker, label: dayET(e.expiryDate) }))}
            className="border-panel-line bg-panel-2 [&_button]:text-on-panel-faint [&_button[aria-checked=true]]:text-on-panel"
            pillColor="#33332f"
          />
        )}
      </div>

      {chart && event ? (
        <>
          <XYChart
            xs={chart.xs}
            series={[
              { key: "quoted", label: "Chance bitcoin ends above each price", color: SERIES.s2, values: chart.quoted, fill: "dots", curve: "smooth" },
              ...(chart.hasTail ? [{ key: "est", label: "Estimated: nobody bets this low", color: SERIES.s2, values: chart.estimated, dashed: true, curve: "smooth" as const }] : []),
            ]}
            xDomain={[chart.xMin, chart.xMax]}
            yDomain={[0, 1]}
            yTicks={[0, 0.5, 1]}
            xTicks={chart.xTicks}
            yFormat={(v) => `${Math.round(v * 100)}%`}
            xFormat={usdK}
            vlines={line != null ? [{ x: line, label: `you lose it below ${usd(line)}`, color: SERIES.s1 }] : []}
            bands={line != null ? [{ x0: chart.xMin, x1: line, color: SERIES.s1, cover: true }] : []}
            markers={spot != null && spot <= chart.xMax ? [{ x: spot, y: 0, color: "#f5f4f0", label: `bitcoin now`, legend: true }] : []}
            tip={(i) => {
              const v = chart.quoted[i] ?? chart.estimated[i];
              return {
                title: usd(chart.xs[i]),
                rows: v == null ? [] : [
                  { label: "ends above", value: pct(v), color: SERIES.s2 },
                  { label: "ends below", value: pct(1 - v), color: SERIES.s1 },
                ],
                note: chart.quoted[i] == null ? "estimated: nobody quotes a bet this low" : "from Gemini's quotes",
              };
            }}
            height={230}
            padRight={16}
            ariaLabel={`Gemini's price ladder for ${event.title}: the chance bitcoin ends above each price, from ${usd(chart.ladder[0].strike)} to ${usd(chart.ladder[chart.ladder.length - 1].strike)}.`}
            table={{ head: ["Price", "Chance it ends above", "Chance it ends below"], rows: chart.ladder.map((p) => [usd(p.strike), pct1(p.pAbove), pct1(1 - p.pAbove)]) }}
          />
          {line != null && chart.below && (() => {
            const estimated = chart.below.source === "estimated";
            const total = own?.odds ?? Math.min(1, chart.below.p * 2);
            // both under a tenth of a percent: "<0.1% doubled is <0.1%" says nothing, so say it in one line
            if (total < 0.001) {
              return (
                <p className="mt-5 border-t border-panel-line pt-4 text-[16px] leading-relaxed text-on-panel-2">
                  Your price is far below anything this market expects: under <strong className="font-semibold text-on-panel">0.1%</strong>, even doubled for a dip at any moment.
                </p>
              );
            }
            return (
              <div className="mt-5 border-t border-panel-line pt-5">
                {/* wide: each figure with its own words. Phone: the three figures in a row, the words as one sentence. */}
                <div className="flex items-baseline gap-x-5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-x-10">
                  <div>
                    <p className="figure text-[2.6rem] text-on-panel sm:text-[3.2rem]">{pct(chart.below.p)}</p>
                    <p className="mt-1.5 hidden max-w-[22ch] text-[14.5px] leading-snug text-on-panel-2 sm:block">the market's chance bitcoin ends below your price on {date}</p>
                  </div>
                  <div className="sm:pt-1 sm:text-center">
                    <p className="figure text-[2rem] text-on-panel-faint sm:text-[2.4rem]">×2 <span className="sm:hidden">=</span></p>
                    <p className="mt-1.5 hidden max-w-[14ch] text-[14.5px] leading-snug text-on-panel-faint sm:block">a dip at any moment counts</p>
                  </div>
                  <div>
                    <p className="figure text-[2.6rem] text-on-panel sm:text-[3.2rem]">{pct(total)}</p>
                    <p className="mt-1.5 hidden max-w-[22ch] text-[14.5px] leading-snug text-on-panel-2 sm:block">chance of losing the bitcoin{limit != null ? `. Airbag steps in at ${pct(limit)}.` : ""}</p>
                  </div>
                </div>
                <p className="mt-2 text-[15px] leading-snug text-on-panel-2 sm:hidden">
                  The market's chance bitcoin ends below your price on {date}, doubled because a dip at any moment counts.{limit != null ? ` Airbag steps in at ${pct(limit)}.` : ""}
                </p>
                {estimated && (
                  <p className="mt-4 text-[14.5px] leading-snug text-on-panel-faint">
                    Estimated: nobody on Gemini bets below {usd(chart.lowest)}, so Airbag extends the market's curve down to your price (the dashed part).
                  </p>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        <p className="py-16 text-center text-[15px] text-on-panel-faint">{ladders?.error ? `Gemini: ${ladders.error}` : "Reading Gemini's market…"}</p>
      )}
    </Panel>
  );
}
