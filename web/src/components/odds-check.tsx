// "Are these odds any good?" The answer from Gemini's own markets that have already ended: for the bitcoin
// ladders that settled in two days, what the market said against how often it happened.
// The numbers are a saved run of scripts/gemini-calibration.mjs (public data, see README): they are a record of
// that check, not a live figure, and the card says when it was made and how small the sample is.
import check from "@/recorded/gemini-calibration.json";
import { XYChart, SERIES } from "@/charts/xy-chart";
import { Panel } from "./bits";

const pc = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

export function OddsCheck({ className }: { className?: string }) {
  const { calibration, touch, traded } = check.summary;
  const rows = calibration.rows.filter((r) => r.bets > 0 && r.said != null && r.happened != null) as { from: number; to: number; bets: number; said: number; happened: number }[];
  if (rows.length < 3) return null;
  // the line of a perfect market runs corner to corner; the market's own points sit along it
  const xs = [0, ...rows.map((r) => r.said), 1];
  const low = rows.find((r) => r.from === 0.1), high = rows.find((r) => r.from === 0.7);
  const factor = touch.factorSeen;

  return (
    <Panel className={className} aria-label="Gemini's odds, checked against what happened">
      <div className="grid gap-x-12 gap-y-7 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0">
          <p className="text-[1.25rem] font-semibold tracking-tight text-on-panel">Are these odds any good? We checked.</p>
          <p className="mt-1 text-[14px] text-on-panel-faint">
            {check.ladders} of Gemini's bitcoin markets that ended {day(check.from)} to {day(check.to)}. {traded} bets that traded before the end.
          </p>
          <div className="mt-5">
            <XYChart
              xs={xs}
              series={[
                { key: "happened", label: "How often it happened", color: SERIES.s2, values: [null, ...rows.map((r) => r.happened), null], curve: "linear" },
                { key: "exact", label: "If the odds were exact", color: "#8a8880", values: xs, dashed: true, curve: "linear" },
              ]}
              markers={rows.map((r) => ({ x: r.said, y: r.happened, color: SERIES.s2 }))}
              xDomain={[0, 1]}
              yDomain={[0, 1]}
              xTicks={[0, 0.25, 0.5, 0.75, 1]}
              yTicks={[0, 0.5, 1]}
              xFormat={pc}
              yFormat={pc}
              tip={(i) => {
                const r = rows[i - 1];
                return r
                  ? { title: `The market said ${pc(r.said)}`, rows: [{ label: "it happened", value: pc(r.happened), color: SERIES.s2 }], note: `${r.bets} bets priced ${pc(r.from)} to ${pc(r.to)}` }
                  : { title: i === 0 ? "0%" : "100%", rows: [] };
              }}
              height={210}
              padRight={16}
              ariaLabel={`What Gemini's market said against how often it happened, for ${traded} settled bets: ${rows.map((r) => `said ${pc(r.said)}, happened ${pc(r.happened)}`).join("; ")}.`}
              table={{ head: ["The market said", "It happened", "Bets"], rows: rows.map((r) => [pc(r.said), pc(r.happened), String(r.bets)]) }}
            />
          </div>
          <p className="mt-2 text-[13px] text-on-panel-faint">Across: what the market said. Up: how often it happened.</p>
        </div>

        <ul className="space-y-6 self-center">
          <li>
            <p className="figure text-[3rem] text-on-panel">{high ? pc(high.happened) : "–"}</p>
            <p className="mt-1.5 max-w-[34ch] text-[1.02rem] leading-snug text-on-panel-2">
              of the bets the market priced near {high ? pc(high.said) : "80%"} came true{low ? `, and ${pc(low.happened)} of those it priced near ${pc(low.said)}` : ""}. Likelier bets happened more often at every step.
            </p>
          </li>
          {factor != null && (
            <li>
              <p className="figure text-[3rem] text-on-panel">{factor.toFixed(1)}×</p>
              <p className="mt-1.5 max-w-[34ch] text-[1.02rem] leading-snug text-on-panel-2">
                Bitcoin dipped below a price {factor.toFixed(1)} times as often as it ended below it. Airbag counts double, so it errs on the careful side.
              </p>
            </li>
          )}
          <li className="text-[13.5px] leading-snug text-on-panel-faint">
            A small sample from thinly traded hourly markets, so read it as a first look. Method and every bet are in the README.
          </li>
        </ul>
      </div>
    </Panel>
  );
}
