// A real save, replayed. Every step is a transaction on Arc Testnet (README "Live proof"), so a visitor with no
// wallet still sees the product work, and nothing on screen is simulated. The data is in recorded/proof.ts.
// The card shows the same two prices as the Loan screen: bitcoin, and the price below which the bitcoin is lost.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import { useStill } from "@/lib/chart-kit";
import { Play, RotateCcw } from "lucide-react";
import { XYChart, SERIES, STATUS } from "@/charts/xy-chart";
import { EXPLORER, VISITOR_RUN } from "@/recorded/proof";
import { short, usd, usdK } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, Count, ExplorerLink, Panel, StatusPill } from "./bits";

// Playback seconds against the real clock. The 3 seconds between the push and the save play at real speed;
// the quiet stretches around them are shortened. [playback second, real second]
const PACE: [number, number][] = [[0, 0], [1.8, 8], [4.8, 11], [6.6, 37], [8.6, 41], [10, 46]];
const LENGTH = PACE[PACE.length - 1][0];
const STEP = 0.05;

function realAt(p: number) {
  for (let i = 1; i < PACE.length; i++) {
    const [p0, r0] = PACE[i - 1], [p1, r1] = PACE[i];
    if (p <= p1) return r0 + ((p - p0) / (p1 - p0)) * (r1 - r0);
  }
  return PACE[PACE.length - 1][1];
}
const playAt = (real: number) => {
  for (let i = 1; i < PACE.length; i++) {
    const [p0, r0] = PACE[i - 1], [p1, r1] = PACE[i];
    if (real <= r1) return p0 + ((real - r0) / (r1 - r0)) * (p1 - p0);
  }
  return LENGTH;
};
const CHIPS = ["Owner borrows more", "Airbag saves it", "Owner pays some back", "Airbag returns savings"];
const STORY = ["A calm loan.", "At risk.", "Saved in 3 seconds.", "The owner pays some back.", "Airbag returns the savings."];

export function SaveReplay({ id }: { id?: string }) {
  const run = VISITOR_RUN;
  const reduced = useStill();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    setPlaying(true);
    const frame = (now: number) => {
      const next = Math.min(LENGTH, (now - start) / 1000);
      setP(next);
      if (next < LENGTH) raf.current = requestAnimationFrame(frame);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(frame);
  }, []);
  // plays once by itself when it scrolls into view; with reduced motion it just shows how it ended
  const started = useRef(false);
  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    if (reduced) setP(LENGTH);
    else play();
  }, [inView, reduced, play]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const real = realAt(p);
  const stepIndex = run.steps.reduce((acc, s, i) => (real >= s.at ? i : acc), -1);
  const state = stepIndex >= 0 ? run.steps[stepIndex] : run.start;
  const pushed = stepIndex === 0;
  const sincePush = real >= run.steps[0].at ? Math.min(real, run.steps[1].at) - run.steps[0].at : null;

  const chart = useMemo(() => {
    const xs: number[] = [];
    for (let x = 0; x <= LENGTH + 1e-9; x += STEP) xs.push(+x.toFixed(2));
    const lineAt = (x: number) => {
      const r = realAt(x);
      const i = run.steps.reduce((acc, s, k) => (r >= s.at ? k : acc), -1);
      return i >= 0 ? run.steps[i].line : run.start.line;
    };
    return { xs, line: xs.map(lineAt), ticks: run.steps.map((s) => +playAt(s.at).toFixed(2)) };
  }, [run]);
  const shown = (v: number, i: number) => (chart.xs[i] <= p + 1e-9 ? v : null);

  return (
    <Panel id={id} tone={pushed ? "critical" : null} className="scroll-mt-6" aria-label="Replay of a recorded save">
      <div ref={ref}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-on-panel-faint">A real save, recorded on Arc Testnet · Nov 18, 2026</p>
          <Button variant="panel" size="sm" onClick={play} disabled={playing}>
            {p >= LENGTH ? <RotateCcw aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
            {playing ? "Playing" : p >= LENGTH ? "Play again" : "Play"}
          </Button>
        </div>

        {/* the headline keeps two lines of room on a phone, and the sentence under it on every screen, so nothing below jumps */}
        <p className={cn("display mt-5 min-h-[2.1em] text-[clamp(2.2rem,5vw,3.4rem)] transition-colors duration-300 sm:min-h-0", pushed ? "text-[#ff6b5e]" : "text-on-panel")} aria-live="polite">
          {STORY[stepIndex + 1]}
        </p>
        <div className="mt-3 grid gap-x-10 gap-y-5 sm:grid-cols-[1.25fr_1fr] sm:items-start">
          <p className="min-h-[4.2em] max-w-[42ch] text-[1.1rem] leading-snug text-on-panel-2 sm:min-h-[2.8em]">{state.say}</p>
          <div className="sm:justify-self-end">
            <div className="flex min-h-7 items-center gap-3">
              <StatusPill tone={pushed ? "critical" : "good"} small>{pushed ? "At risk" : "Safe"}</StatusPill>
              <p className="mono text-[13px] text-on-panel-faint">{sincePush == null ? "" : pushed ? `${sincePush.toFixed(1)} s at risk` : `saved in ${sincePush.toFixed(1)} s`}</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-8">
              <div>
                <dt className="flex items-center gap-2 text-[14px] text-on-panel-2"><span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: SERIES.s2 }} />Bitcoin</dt>
                <dd className="figure mt-1.5 text-[2.3rem] text-on-panel sm:text-[2.6rem]">{usd(run.btc)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-[14px] text-on-panel-2"><span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: SERIES.s1 }} />Lost below</dt>
                <dd className={cn("figure mt-1.5 text-[2.3rem] transition-colors duration-300 sm:text-[2.6rem]", pushed ? "text-[#ff6b5e]" : "text-on-panel")}><Count value={state.line} format={usd} /></dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-5">
          <XYChart
            xs={chart.xs}
            series={[
              { key: "btc", label: "Bitcoin's price", color: SERIES.s2, values: chart.xs.map((_, i) => shown(run.btc, i)), endLabel: p >= LENGTH ? "bitcoin" : undefined },
              { key: "line", label: "The bitcoin is lost below this", color: SERIES.s1, values: chart.line.map(shown), curve: "step" },
            ]}
            xDomain={[0, LENGTH]}
            yDomain={[40_000, 70_000]}
            yTicks={[40_000, 50_000, 60_000, 70_000]}
            xTicks={[]}
            yFormat={usdK}
            xFormat={() => ""}
            bands={pushed ? [{ x0: chart.ticks[0], x1: Math.max(p, chart.ticks[0]), y0: state.line, y1: run.btc, color: STATUS.critical }] : []}
            markers={run.steps.filter((_, i) => i <= stepIndex).map((s, i) => ({ x: chart.ticks[i], y: s.line, color: s.who === "bot" ? SERIES.s1 : "#f5f4f0" }))}
            height={180}
            padRight={62}
            hideLegend
            ariaLabel={`The price below which the bitcoin is lost jumps to ${usd(run.steps[0].line)}, close to bitcoin's price of ${usd(run.btc)}. Three seconds later Airbag moves it back down to ${usd(run.steps[1].line)}.`}
          />
        </div>

        <ol className="mt-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {run.steps.map((s, i) => {
            const done = i <= stepIndex;
            return (
              <li key={s.tx} className={cn("rounded-2xl border border-panel-line p-3.5 transition-opacity duration-300 sm:p-4", done ? "bg-panel-2" : "opacity-40")}>
                <p className="flex items-center gap-2 text-[15px] font-semibold leading-tight text-on-panel sm:text-[16px]">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.who === "bot" ? SERIES.s1 : "#f5f4f0" }} />
                  {CHIPS[i]}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[14px] text-on-panel-faint">
                  <span className="mono">{s.utc} UTC</span>
                  <ExplorerLink explorer={EXPLORER} kind="tx" id={s.tx}>see it on Arc</ExplorerLink>
                </p>
              </li>
            );
          })}
        </ol>

        <details className="mt-4 text-[14.5px] text-on-panel-faint">
          <summary className="cursor-pointer select-none hover:text-on-panel-2">What exactly happened</summary>
          <ol className="mt-3 space-y-2 text-on-panel-2">
            {run.steps.map((s) => (
              <li key={s.tx}>
                <span className="mono text-on-panel-faint">{s.utc}</span> {s.who === "bot" ? "Airbag: " : "The owner: "}
                {s.detail}
                {"gas" in s && s.gas != null ? ` Gas: ${s.gas} USDC.` : ""}
              </li>
            ))}
          </ol>
          <p className="mt-3 leading-relaxed">
            The wallet <ExplorerLink explorer={EXPLORER} kind="address" id={run.wallet}>{short(run.wallet)}</ExplorerLink> set this up from this page:{" "}
            {run.setup.map((s, i) => (
              <span key={s.tx}>
                <ExplorerLink explorer={EXPLORER} kind="tx" id={s.tx}>{s.label}</ExplorerLink>
                {i < run.setup.length - 1 ? ", " : "."}
              </span>
            ))}{" "}
            Airbag moved the money through that wallet's own guard contract, <ExplorerLink explorer={EXPLORER} kind="address" id={run.guard}>{short(run.guard)}</ExplorerLink>, and never held the wallet's key. The 3 seconds between the push and the save play at real speed; the waits around them are shortened.
          </p>
        </details>
      </div>
    </Panel>
  );
}
