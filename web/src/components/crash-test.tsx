// The landing page's first screen: the headline, and under it a crash test drawn like a frame from a crash-test lab,
// straight on the page. February 2026's real bitcoin prices, run through the bot's own rule (replay/results.json,
// through src/crash-test.mjs): a car (the loan) with a bitcoin in the driver's seat drives into the day bitcoin hit
// bottom, once without Airbag and once with it. One big number says how much of the bitcoin is still yours. Every
// number on it comes from that replay. It plays once by itself (without, then with), then waits for a press.
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useInView } from "motion/react";
import { Bitcoin, RotateCcw } from "lucide-react";
import { crashTestFacts, type CrashTestFacts } from "@crash";
import type { CrashReplay } from "@/lib/api";
import { useStill } from "@/lib/chart-kit";
import { dayUTC, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Mode = "without" | "with";
type Facts = CrashTestFacts;

// ------------------------------------------------------------------ the timeline (seconds)

const LEAD = 0.5;      // the car sits a moment, then sets off
const PER_DAY = 0.46;  // one day of February per 0.46 s
const AFTER = 1.6;     // the crash, and what is left of the bitcoin
const PAUSE = 1.8;     // between the two runs when it plays by itself
const FIRST_WAIT = 0.9; // before the first run, so the eye can come down from the headline

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

/** How far along the road the car is (0 at the start, 1 at the wall), and which day it is. The car moves with
 *  bitcoin's price: a slow roll while it slips, a lunge on the day it falls hard. */
function rideAt(t: number, days: Facts["days"]) {
  const n = days.length - 1;
  const u = clamp((t - LEAD) / (n * PER_DAY));
  const p0 = days[0].low, p1 = days[n].low;
  const fallen = (i: number) => (p0 - days[i].low) / (p0 - p1 || 1);
  const d = u * n;
  const i = Math.min(n - 1, Math.floor(d));
  return { x: clamp(0.3 * u + 0.7 * lerp(fallen(i), fallen(i + 1), d - i)), day: Math.min(n, Math.floor(d + 1e-6)) };
}

// ------------------------------------------------------------------ the drawing

// The car is drawn facing right in a 210 × 96 box, wheels touching y = 96, then scaled up. Its front crumples on
// impact: every point ahead of the windscreen moves back by up to a third.
const NOSE = 208;
const CRUMPLE_FROM = 166;
const SEAT = { x: 114, y: 33 };
const COIN_R = 10;
const BTC_ORANGE = "#f7931a";
function bodyPath(c: number) {
  const f = (x: number) => (x <= CRUMPLE_FROM ? x : CRUMPLE_FROM + (x - CRUMPLE_FROM) * (1 - 0.34 * c));
  return [
    `M 8 76 C 6 66 6 56 12 52 L 40 46`,
    `C 52 30 62 18 74 15 L 122 13 C 132 13 140 18 148 26 L ${f(166)} 44`,
    `C ${f(184)} 46 ${f(198)} 49 ${f(204)} 54 C ${f(208)} ${58 + 3 * c} ${f(209)} 66 ${f(208)} 74 L ${f(206)} 80 L ${f(182)} 80`,
    `A 22 22 0 0 0 140 80 L 74 80 A 22 22 0 0 0 32 80 L 12 80 C 9 80 8 79 8 76 Z`,
  ].join(" ");
}
const WINDOW = "M 48 46 C 58 32 66 22 76 19 L 120 17.5 C 128 17.5 134 21 140 27 L 156 44 Z";
const LINE = { vectorEffect: "non-scaling-stroke" as const };

/** The black and white target painted on crash-test cars. */
function Marker({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="var(--paper)" stroke="currentColor" strokeWidth={1.25} style={LINE} />
      <path d={`M0 0 L${r} 0 A${r} ${r} 0 0 1 0 ${r} Z M0 0 L${-r} 0 A${r} ${r} 0 0 1 0 ${-r} Z`} fill="currentColor" />
    </g>
  );
}

/** A slice of the coin, from angle a0 to a1 (radians, clockwise from the right). */
const wedge = (a0: number, a1: number, r = COIN_R) =>
  `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;

// a phone gets a narrower stage, so the car stays big enough to read
const PHONE = "(max-width: 639px)";
const usePhone = () => useSyncExternalStore(
  (on) => { const mq = matchMedia(PHONE); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); },
  () => matchMedia(PHONE).matches,
  () => false,
);

// ?crash=without or ?crash=with in the address holds that run's ending, and &t=2.1 a moment of it (seconds): for
// pictures, and for talking over one moment.
const HOLD: Mode | null = (() => {
  if (typeof location === "undefined") return null;
  const v = new URLSearchParams(location.search).get("crash");
  return v === "without" || v === "with" ? v : null;
})();
const HOLD_T = (() => {
  if (typeof location === "undefined") return null;
  const v = Number(new URLSearchParams(location.search).get("t"));
  return Number.isFinite(v) && v > 0 ? v : null;
})();

const OPTIONS = [
  { value: "without", label: "Without Airbag" },
  { value: "with", label: "With Airbag" },
];

export function CrashTest({ replay, children, actions }: {
  replay: CrashReplay | null;
  /** The headline and the sentence under it. */
  children: React.ReactNode;
  /** The page's main action, beside the switch. */
  actions?: React.ReactNode;
}) {
  const facts = useMemo(() => crashTestFacts(replay), [replay]);
  const still = useStill();
  const phone = usePhone();
  const uid = "crash" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  const n = facts ? facts.days.length - 1 : 5;
  const IMPACT = LEAD + n * PER_DAY;
  const END = IMPACT + AFTER;

  const [mode, setMode] = useState<Mode>(HOLD ?? "without");
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const next = useRef<number | undefined>(undefined);

  const run = useCallback((m: Mode, then?: () => void) => {
    cancelAnimationFrame(raf.current);
    clearTimeout(next.current);
    setMode(m);
    setT(0);
    const start = performance.now();
    const frame = (now: number) => {
      const s = Math.min(END, (now - start) / 1000);
      setT(s);
      if (s < END) raf.current = requestAnimationFrame(frame);
      else then?.();
    };
    raf.current = requestAnimationFrame(frame);
  }, [END]);

  // plays once by itself when it first comes into view: without Airbag, then with it, so a visitor who never presses
  // anything still sees both. With reduced motion (or ?still) it shows how the run with Airbag ends.
  const started = useRef(false);
  useEffect(() => {
    if (!facts || started.current) return;
    // a held moment, or no motion: show it at once, in view or not (a background tab never reports "in view")
    if (HOLD || still) {
      started.current = true;
      setMode(HOLD ?? "with");
      setT(HOLD && HOLD_T != null ? Math.min(END, HOLD_T) : END);
      return;
    }
    if (!inView) return;
    started.current = true;
    next.current = window.setTimeout(() => run("without", () => { next.current = window.setTimeout(() => run("with"), PAUSE * 1000); }), FIRST_WAIT * 1000);
  }, [facts, inView, still, run, END]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(next.current); }, []);

  const choose = (m: Mode) => {
    clearTimeout(next.current);
    if (still) {
      cancelAnimationFrame(raf.current);
      setMode(m);
      setT(END);
    } else run(m);
  };

  // ---------------------------------------------------------------- the scene at time t
  const W = phone ? 620 : 1200;
  const H = phone ? 300 : 290;
  const GROUND = H - 40;
  const S = phone ? 1.5 : 1.62;                // the car's scale
  const CAR_H = 96 * S;
  const CAR_TOP = GROUND - CAR_H;
  const WALL_W = phone ? 78 : 108;
  const WALL_H = phone ? 162 : 176;
  const WALL_X = W - WALL_W - (phone ? 10 : 6);
  const START_X = phone ? 0 : 8;
  const ROAD_END = WALL_X - NOSE * S;

  const ride = facts ? rideAt(t, facts.days) : { x: 0, day: 0 };
  const rideBefore = facts ? rideAt(Math.max(0, t - 1 / 30), facts.days) : ride;
  const speed = Math.max(0, ride.x - rideBefore.x) * 30; // road lengths per second
  const tau = t - IMPACT; // seconds since the impact (negative before it)
  const hit = tau >= 0;
  const tDeploy = facts ? LEAD + facts.saveIndex * PER_DAY : Infinity;
  const withBag = mode === "with";
  const alarm = facts != null && t >= tDeploy;
  const inflate = withBag && alarm ? easeOutBack(clamp((t - tDeploy) / 0.32)) : 0;
  const pop = withBag && alarm ? clamp((t - tDeploy) / 0.6) : 1; // one ring from the window as it goes off

  const crumple = hit ? easeOut(clamp(tau / 0.09)) : 0;
  const crumpledBy = (NOSE - CRUMPLE_FROM) * 0.34 * crumple * S;
  const rebound = hit ? 16 * easeOut(clamp((tau - 0.06) / 0.35)) : 0;
  const carX = hit ? ROAD_END + crumpledBy - rebound : lerp(START_X, ROAD_END, ride.x);
  const shake = hit && tau < 0.7 ? 6 * Math.exp(-9 * tau) * Math.sin(58 * tau) : 0;

  // the coin: thrown forward on impact. Into the airbag (and back), or into the dashboard, where it breaks.
  const shattered = hit && !withBag && tau >= 0.08;
  const coinDX = hit ? (withBag ? 9 * Math.sin(Math.PI * clamp(tau / 0.32)) : 15 * easeOut(clamp(tau / 0.08))) : 0;
  const squash = withBag && hit ? 1 - 0.28 * Math.sin(Math.PI * clamp(tau / 0.32)) : 1;
  const k = clamp((tau - 0.08) / 0.85); // how far the broken pieces have flown
  const kept = facts?.btcKept ?? 0.1;
  const yours = !facts ? 1 : shattered ? lerp(1, kept, easeOut(clamp((tau - 0.08) / 0.6))) : 1;
  const done = facts != null && t >= END - 1e-6;
  const outcome = facts != null && hit && tau > 0.5;

  const day = facts ? facts.days[ride.day] : null;
  const saveDay = facts ? dayUTC(facts.days[facts.saveIndex].date) : "";
  // the note that rides above the car once the odds pass the limit: what Airbag does about it, or that nothing does
  const note = facts && alarm && !hit ? (withBag ? `${saveDay}: crash odds pass 5%, so the airbag goes off` : `${saveDay}: crash odds pass 5%. No airbag.`) : null;
  const noteX = clamp(((carX + 128 * S) / W) * 100, phone ? 34 : 14, phone ? 66 : 80);
  const noteY = ((CAR_TOP - 6) / H) * 100;

  const line = !facts
    ? "Loading February's prices…"
    : outcome
      ? withBag
        ? `Kept. Airbag paid the loan down on ${saveDay}, ${facts.daysEarly} days before the crash.`
        : `Sold off on ${dayUTC(facts.crash.date)}. ${(1 - kept).toFixed(2)} BTC went to repay the loan.`
      : `Bitcoin's low on ${dayUTC(day!.date)}: ${usd(day!.low)}`;
  const sayEnd = !facts
    ? ""
    : withBag
      ? `With Airbag: all 1 bitcoin kept. Airbag paid the loan down on ${saveDay}, ${facts.daysEarly} days before bitcoin hit ${usd(facts.crash.low)}.`
      : `Without Airbag: on ${dayUTC(facts.crash.date)} bitcoin fell below ${usd(facts.line0)} and ${(1 - kept).toFixed(2)} of the bitcoin was sold to repay the loan. ${kept.toFixed(2)} of 1 bitcoin left.`;

  return (
    // Wide: the words and the switch on the left, the number on the right, the stage across the bottom (the number's
    // column has a fixed width, so "1 BTC" turning into "0.10 BTC" moves nothing else). Narrow: words, switch, stage,
    // number, so the car is on the first screen of a phone.
    <div aria-label="Crash test: February 2026, replayed with and without Airbag" role="region" className="grid gap-x-12 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">
          {children}
          {/* the one thing to press, and the page's main action */}
          <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
            <SegmentedControl
              aria-label="Run the crash test with or without Airbag"
              value={mode}
              onValueChange={(v) => choose(v as Mode)}
              options={OPTIONS}
              size="lg"
              className="border-line bg-ink/[0.04]"
              pillColor="var(--paper)"
            />
            <button type="button" onClick={() => choose(mode)} disabled={!facts} className="inline-flex h-12 items-center gap-2 rounded-full px-3 text-[16px] font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-40">
              <RotateCcw aria-hidden="true" className="size-[18px]" />
              Replay
            </button>
            {actions && <div className="flex flex-wrap gap-3 sm:ml-2">{actions}</div>}
          </div>
        </div>

        {/* how much of the bitcoin is still yours: the one number that matters */}
        <div className="order-3 mt-6 xl:order-none xl:col-start-2 xl:row-start-1 xl:mt-0 xl:self-end xl:pb-1 xl:text-right" aria-live="polite">
          <p className="text-[17px] text-ink-2">Your bitcoin</p>
          <p className={cn("figure mt-2 whitespace-nowrap text-[clamp(4.2rem,15vw,7.2rem)] tabular-nums transition-colors duration-300 xl:text-[7.4rem]", shattered ? "text-critical" : outcome && withBag ? "text-good" : "text-ink")}>
            {yours >= 0.995 ? "1" : yours.toFixed(2)} BTC
          </p>
          <p className="mt-3 min-h-[3.2em] max-w-[34ch] text-[17px] leading-snug text-ink-2 xl:ml-auto">{line}</p>
        </div>

      {/* the stage: a road with a measuring floor, a barrier, and the car. It starts playing once it is on screen. */}
      <div ref={ref} className="relative order-2 mt-10 text-ink xl:order-none xl:col-span-2 xl:row-start-2 xl:mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={done ? sayEnd : "A car carrying one bitcoin drives into a wall, as bitcoin falls in February 2026."}>
          <defs>
            <pattern id={`${uid}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="currentColor" strokeWidth="1.1" opacity="0.32" />
            </pattern>
            <clipPath id={`${uid}-glass`}>
              <path d={WINDOW} />
            </clipPath>
          </defs>

          <g transform={`translate(${shake} 0)`}>
            {/* the floor of the test track: a line, and a ruler under it */}
            <line x1="0" x2={W} y1={GROUND} y2={GROUND} stroke="currentColor" strokeWidth="1.5" style={LINE} />
            {Array.from({ length: Math.floor(W / 24) + 1 }, (_, i) => (
              <line key={i} x1={i * 24} x2={i * 24} y1={GROUND + 6} y2={GROUND + (i % 5 === 0 ? 20 : 12)} stroke="currentColor" strokeWidth="1" opacity={i % 5 === 0 ? 0.45 : 0.22} style={LINE} />
            ))}

            {/* the barrier: the day bitcoin hit bottom */}
            <g transform={`translate(${WALL_X + (hit ? Math.max(0, 3 * Math.exp(-14 * tau) * Math.sin(70 * tau)) : 0)} 0)`}>
              <rect x="0" y={GROUND - WALL_H} width={WALL_W} height={WALL_H} fill="var(--page)" />
              <rect x="0" y={GROUND - WALL_H} width={WALL_W} height={WALL_H} fill={`url(#${uid}-hatch)`} stroke="currentColor" strokeWidth="1.75" style={LINE} />
            </g>

            {/* speed lines while it lunges */}
            {!hit && speed > 0.25 && (
              <g opacity={clamp((speed - 0.25) / 0.6) * 0.4} stroke="currentColor" strokeLinecap="round">
                {[34, 62, 92].map((y, i) => (
                  <line key={y} x1={carX - 20 - (90 - i * 22)} x2={carX - 14} y1={CAR_TOP + y * (S / 1.62)} y2={CAR_TOP + y * (S / 1.62)} strokeWidth="1.5" style={LINE} />
                ))}
              </g>
            )}

            {/* the car */}
            <g transform={`translate(${carX} ${CAR_TOP}) scale(${S})`}>
              <ellipse cx={110} cy={96} rx={100} ry={3.5} fill="currentColor" opacity="0.12" />
              <path d={bodyPath(crumple)} fill="var(--paper)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" style={LINE} />
              <path d="M 12 66 L 204 66" stroke="currentColor" strokeWidth="1" opacity="0.28" transform={`scale(${1 - 0.07 * crumple} 1)`} style={LINE} />
              <path d="M 100 46 L 100 79 M 58 47 L 58 79" stroke="currentColor" strokeWidth="1" opacity="0.3" style={LINE} />
              <path d={WINDOW} fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" style={LINE} />
              <path d="M 98 18 L 98 45 L 103 45 L 103 18 Z" fill="var(--paper)" stroke="currentColor" strokeWidth="1" style={LINE} />

              {/* inside, behind the glass: the steering wheel, the airbag, and the bitcoin in the driver's seat */}
              <g clipPath={`url(#${uid}-glass)`}>
                <path d="M 146 44 L 140 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
                <ellipse cx={139} cy={31} rx={2.4} ry={7.5} transform="rotate(-24 139 31)" fill="currentColor" opacity="0.7" />
                {inflate > 0 && (
                  <g transform={`translate(136 31) scale(${inflate * squash} ${inflate})`}>
                    <ellipse cx={-6} cy={0} rx={13} ry={13} fill="var(--paper)" stroke="currentColor" strokeWidth="1.25" style={LINE} />
                  </g>
                )}
                {!shattered && (
                  <g transform={`translate(${SEAT.x + coinDX} ${SEAT.y})`}>
                    <circle r={COIN_R} fill={BTC_ORANGE} />
                    <Bitcoin x={-6.5} y={-6.5} width={13} height={13} color="#fff" strokeWidth={2.6} />
                  </g>
                )}
                {shattered && (
                  // what the sale leaves: the outline of the whole coin, and the tenth of it that is still yours
                  <g transform={`translate(${SEAT.x} ${SEAT.y})`}>
                    <circle r={COIN_R} fill="none" stroke={BTC_ORANGE} strokeWidth="1.2" strokeDasharray="2.2 2.2" opacity={clamp(k * 2)} style={LINE} />
                    <path d={wedge(-Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * kept)} fill={BTC_ORANGE} />
                  </g>
                )}
              </g>

              {/* a cracked windscreen when there is no airbag */}
              {shattered && (
                <g stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" fill="none" opacity={0.8 * clamp(k * 3)} style={LINE}>
                  <path d="M 148 31 L 141 23 M 148 31 L 154 40 M 148 31 L 141 37 M 148 31 L 152 25 M 144 27 L 140 30 M 151 36 L 147 41" style={LINE} />
                </g>
              )}
              {withBag && outcome && (
                <circle cx={SEAT.x} cy={SEAT.y} r={COIN_R + 4 + 2.5 * Math.sin(Math.min(tau, 3) * 5)} fill="none" stroke="var(--good)" strokeWidth="1.5" style={LINE} />
              )}
              {pop < 1 && (
                <circle cx={128} cy={31} r={16 + 50 * easeOut(pop)} fill="none" stroke="var(--brand)" strokeWidth={2.5 - 1.5 * pop} opacity={0.9 * (1 - pop)} style={LINE} />
              )}

              <Marker x={80} y={58} r={5.5} />
              <Marker x={28} y={58} r={4.5} />
              <rect x={7} y={56} width={4} height={8} rx={1.5} fill="var(--critical)" />
              <rect x={NOSE - 6 - crumpledBy / S} y={57} width={5} height={7} rx={1.5} fill="#f2c94c" opacity={1 - crumple * 0.6} />

              {/* wheels */}
              {[53, 161].map((cx) => (
                <g key={cx} transform={`translate(${cx} 80) rotate(${(ride.x * 2400) % 360})`}>
                  <circle r={16} fill="currentColor" />
                  <circle r={9.5} fill="var(--paper)" />
                  <circle r={3} fill="currentColor" />
                  <path d="M -9 0 L 9 0 M 0 -9 L 0 9" stroke="currentColor" strokeWidth="1.25" opacity="0.6" style={LINE} />
                </g>
              ))}
            </g>

            {/* the impact: lines from the barrier, and the broken pieces of the bitcoin flying out */}
            {hit && tau < 0.4 && (
              <g transform={`translate(${WALL_X - 3} ${CAR_TOP + 62 * S})`} stroke="currentColor" strokeLinecap="round" opacity={1 - tau / 0.4}>
                {[-60, -30, 0, 30, 60, 200, 160].map((a) => {
                  const r0 = 10 + 36 * easeOut(clamp(tau / 0.25)), r1 = r0 + 20;
                  const rad = (a * Math.PI) / 180;
                  return <line key={a} x1={-Math.cos(rad) * r0} y1={Math.sin(rad) * r0} x2={-Math.cos(rad) * r1} y2={Math.sin(rad) * r1} strokeWidth="2" style={LINE} />;
                })}
              </g>
            )}
            {shattered && k < 1 && (
              <g transform={`translate(${carX + (SEAT.x + 15) * S} ${CAR_TOP + SEAT.y * S}) scale(${S})`}>
                {Array.from({ length: 9 }, (_, i) => {
                  const a0 = -Math.PI / 2 + 2 * Math.PI * (kept + (i * (1 - kept)) / 9);
                  const a1 = -Math.PI / 2 + 2 * Math.PI * (kept + ((i + 1) * (1 - kept)) / 9);
                  const mid = (a0 + a1) / 2;
                  const fly = easeOut(k);
                  const dx = Math.cos(mid) * 46 * fly + 70 * fly - 30 * k * k;
                  const dy = Math.sin(mid) * 40 * fly - 26 * fly + 120 * k * k;
                  return <path key={i} d={wedge(a0, a1)} fill={BTC_ORANGE} opacity={1 - k} transform={`translate(${dx} ${dy}) rotate(${(i % 2 ? 1 : -1) * 260 * k})`} />;
                })}
              </g>
            )}
          </g>
        </svg>

        {/* the barrier's label, and the note above the car: written in HTML so they stay readable at any width */}
        {facts && (
          <p className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap pb-2 text-[15px] font-medium text-ink-2 sm:text-[16px]" style={{ left: `${((WALL_X + WALL_W / 2) / W) * 100}%`, top: `${((GROUND - WALL_H) / H) * 100}%` }}>
            {dayUTC(facts.crash.date)}
          </p>
        )}
        {note && (
          <p
            className={cn("pointer-events-none absolute -translate-x-1/2 -translate-y-full text-balance text-center text-[15px] font-semibold leading-snug sm:whitespace-nowrap sm:text-[17px]", withBag ? "text-ink" : "text-ink-2")}
            style={{ left: `${noteX}%`, top: `${noteY}%`, width: phone ? "min(80vw, 300px)" : undefined }}
          >
            <span aria-hidden="true" className={cn("mr-2 inline-block size-2.5 -translate-y-px rounded-full align-middle", withBag ? "bg-brand" : "bg-warning")} />
            {note}
          </p>
        )}
      </div>

      <p className="order-4 mt-6 text-[15px] text-ink-2 sm:text-[16px] xl:col-span-2 xl:row-start-3">
        A {facts ? usd(facts.debt0) : "$52,705"} loan against 1 bitcoin, on February 2026's real prices.{" "}
        <a href="#how" className="whitespace-nowrap text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink">How we replayed it</a>
      </p>
    </div>
  );
}
