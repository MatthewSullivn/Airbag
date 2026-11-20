// The first thing on the landing page: a crash test. February 2026's real bitcoin prices, run through the bot's own
// rule (replay/results.json, the same run as step 1's chart), drawn as a car driving into a wall, with and without
// Airbag. The car is the loan, the coin in the driver's seat is the bitcoin, the wall is the day bitcoin hit bottom.
// Every number on it comes from that replay. It plays once by itself (without, then with) and then waits for a press.
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useInView } from "motion/react";
import { ArrowDown, ArrowRight, Bitcoin, RotateCcw, TriangleAlert } from "lucide-react";
import { crashTestFacts, type CrashTestFacts } from "@crash";
import type { CrashReplay } from "@/lib/api";
import { useStill } from "@/lib/chart-kit";
import { dayUTC, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "./bits";

type Mode = "without" | "with";

// what the replay says: worked out by src/crash-test.mjs (shared with the tests, which hold it to the replay)
type Facts = CrashTestFacts;

// ------------------------------------------------------------------ the timeline (seconds)

const LEAD = 0.45;   // the car sits a moment, then sets off
const PER_DAY = 0.42; // one day of February per 0.42 s
const AFTER = 1.5;   // the crash and what is left of the bitcoin
const PAUSE = 1.6;   // between the two runs when it plays by itself
const FIRST_WAIT = 0.8; // before the first run, when it plays by itself

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

/** How far along the road the car is (0 at the start, 1 at the wall), and which day it is. The car moves with
 *  bitcoin's price: a slow roll while it slips, a lunge on the day it falls hard. */
function rideAt(t: number, days: Facts["days"]) {
  const n = days.length - 1;
  const travel = n * PER_DAY;
  const u = clamp((t - LEAD) / travel);
  const p0 = days[0].low, p1 = days[n].low;
  const fallen = (i: number) => (p0 - days[i].low) / (p0 - p1 || 1);
  const d = u * n;
  const i = Math.min(n - 1, Math.floor(d));
  const price = lerp(fallen(i), fallen(i + 1), d - i);
  return { x: clamp(0.3 * u + 0.7 * price), day: Math.min(n, Math.floor(d + 1e-6)) };
}

// ------------------------------------------------------------------ the picture

// The car is drawn facing right in a 210 × 96 box, wheels touching y = 96. Its front crumples on impact: every
// point ahead of the windscreen moves back by up to a third.
const NOSE = 208;
const CRUMPLE_FROM = 166;
const SEAT = { x: 114, y: 33 };
const COIN_R = 10;
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

/** A crash-test marker: the black and yellow target painted on test cars. */
function Marker({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} className="fill-warning" />
      <path d={`M0 0 L${r} 0 A${r} ${r} 0 0 1 0 ${r} Z M0 0 L${-r} 0 A${r} ${r} 0 0 1 0 ${-r} Z`} fill="#161616" />
    </g>
  );
}

/** A slice of the coin, from angle a0 to a1 (radians, clockwise from the right). */
const wedge = (a0: number, a1: number, r = COIN_R) =>
  `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;

// a phone gets a narrower, taller stage, so the car stays big enough to read
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
const SWITCH = "border-panel-line bg-panel-2 [&_button]:text-on-panel-faint [&_button[aria-checked=true]]:text-on-panel";

export function CrashTest({ replay, className }: { replay: CrashReplay | null; className?: string }) {
  const facts = useMemo(() => crashTestFacts(replay), [replay]);
  const still = useStill();
  const phone = usePhone();
  const uid = "crash" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

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
    // a beat first, so the eye can come down from the headline before the car sets off
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

  // ---------------------------------------------------------------- the state of the scene at time t
  const W = phone ? 540 : 840;
  const H = phone ? 200 : 164;
  const GROUND = H - 20;
  const CAR_TOP = GROUND - 96;
  const WALL_H = 112;
  const WALL_W = phone ? 54 : 58;
  const WALL_X = W - WALL_W - (phone ? 16 : 26);
  const START_X = phone ? 4 : 18;
  const ROAD_END = WALL_X - NOSE;

  const ride = facts ? rideAt(t, facts.days) : { x: 0, day: 0 };
  const rideBefore = facts ? rideAt(Math.max(0, t - 1 / 30), facts.days) : ride;
  const speed = Math.max(0, ride.x - rideBefore.x) * 30; // road lengths per second
  const tau = t - IMPACT; // seconds since the impact (negative before it)
  const hit = tau >= 0;
  const tDeploy = facts ? LEAD + facts.saveIndex * PER_DAY : Infinity;
  const withBag = mode === "with";
  const alarm = facts != null && t >= tDeploy;
  const inflate = withBag && alarm ? easeOutBack(clamp((t - tDeploy) / 0.32)) : 0;
  // the moment it fires: one ring that spreads from the window, so the eye goes there
  const pop = withBag && alarm ? clamp((t - tDeploy) / 0.55) : 1;

  const crumple = hit ? easeOut(clamp(tau / 0.09)) : 0;
  const crumpledBy = (NOSE - CRUMPLE_FROM) * 0.34 * crumple;
  const rebound = hit ? 13 * easeOut(clamp((tau - 0.06) / 0.35)) : 0;
  const carX = (hit ? ROAD_END + crumpledBy - rebound : lerp(START_X, ROAD_END, ride.x));
  const shake = hit && tau < 0.7 ? 5 * Math.exp(-9 * tau) * Math.sin(58 * tau) : 0;

  // the coin: thrown forward on impact. Into the airbag (and back), or into the dashboard, where it breaks.
  const shattered = hit && !withBag && tau >= 0.08;
  const coinDX = hit ? (withBag ? 9 * Math.sin(Math.PI * clamp(tau / 0.32)) : 15 * easeOut(clamp(tau / 0.08))) : 0;
  const squash = withBag && hit ? 1 - 0.28 * Math.sin(Math.PI * clamp(tau / 0.32)) : 1;
  const k = clamp((tau - 0.08) / 0.85); // how far the broken pieces have flown
  const kept = facts?.btcKept ?? 0.1;
  const yours = !facts ? 1 : shattered ? lerp(1, kept, easeOut(clamp((tau - 0.08) / 0.55))) : 1;
  const done = facts != null && t >= END - 1e-6;
  const outcome = facts != null && hit && tau > 0.45;

  const day = facts ? facts.days[ride.day] : null;
  const label = facts ? (alarm && !hit ? (withBag ? "Crash odds over 5% · Airbag deploys" : "Crash odds over 5% · no airbag") : null) : null;
  // the alarm rides above the car; on a phone it is nearly as wide as the stage, so it stays in the middle
  const labelLeft = phone ? 50 : clamp(((carX + 118) / W) * 100, 16, 84);
  const labelTop = ((CAR_TOP + 4) / H) * 100;

  const sayEnd = !facts
    ? ""
    : withBag
      ? `With Airbag: all 1 bitcoin kept. Airbag paid the loan down on ${dayUTC(facts.days[facts.saveIndex].date)}, ${facts.daysEarly} days before bitcoin hit ${usd(facts.crash.low)}.`
      : `Without Airbag: on ${dayUTC(facts.crash.date)} bitcoin fell below ${usd(facts.line0)} and ${(1 - kept).toFixed(2)} of the bitcoin was sold to repay the loan. ${kept.toFixed(2)} of 1 bitcoin left.`;

  return (
    <section
      ref={ref}
      aria-label="Crash test: February 2026, replayed with and without Airbag"
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-panel-line bg-panel text-left text-on-panel shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_30px_60px_-30px_rgb(0_0_0/0.45)] sm:rounded-[32px]",
        className,
      )}
    >
      {/* the switch and the run-again button (the one thing to press), and two read-outs like a dashboard's:
          the day and bitcoin's price that day, and how much of the bitcoin is still yours */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-1.5">
          <SegmentedControl aria-label="Run the crash test with or without Airbag" value={mode} onValueChange={(v) => choose(v as Mode)} options={OPTIONS} size={phone ? "sm" : "md"} className={SWITCH} pillColor={mode === "with" ? "var(--brand)" : "#3a3a37"} />
          <Button variant="ghost" size="sm" className="px-2.5" onClick={() => choose(mode)} disabled={!facts} aria-label="Run it again">
            <RotateCcw aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline" aria-hidden="true">Replay</span>
          </Button>
        </div>
        <dl className="flex w-full items-end justify-between gap-6 sm:w-auto sm:justify-end sm:gap-9">
          <div>
            <dt className="mono text-[11.5px] uppercase tracking-[0.08em] text-on-panel-faint">{day ? dayUTC(day.date) : "Feb 2026"} · bitcoin's low</dt>
            <dd className="figure mt-1 text-[1.75rem] text-on-panel sm:text-[2rem]">{day ? usd(day.low) : "–"}</dd>
          </div>
          <div className="text-right">
            <dt className="mono text-[11.5px] uppercase tracking-[0.08em] text-on-panel-faint">Your bitcoin</dt>
            <dd className={cn("figure mt-1 text-[1.75rem] transition-colors duration-300 sm:text-[2rem]", shattered ? "text-[#ff6b5e]" : outcome && withBag ? "text-[#3ddc84]" : "text-on-panel")}>
              {yours >= 0.995 ? "1" : yours.toFixed(2)} BTC
            </dd>
          </div>
        </dl>
      </div>

      {/* the stage */}
      <div className="relative">
        {/* where it comes from, one click away: step 1 has the chart, the table and the note that February's odds are modelled */}
        <a
          href="#how"
          aria-label="How the February 2026 crash was replayed"
          className={cn("mono absolute left-4 top-2 z-10 text-[11px] uppercase tracking-[0.08em] text-on-panel-faint no-underline transition-opacity duration-200 hover:text-on-panel-2 sm:left-6 sm:top-3", label && "opacity-0")}
        >
          Feb 2026 · real prices · how <ArrowDown aria-hidden="true" className="inline size-3 -translate-y-px" />
        </a>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={done ? sayEnd : "A car carrying one bitcoin drives into a wall, as bitcoin falls in February 2026."}>
          <defs>
            <pattern id={`${uid}-hazard`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="14" height="14" fill="#161616" />
              <rect width="7" height="14" className="fill-warning" />
            </pattern>
            <clipPath id={`${uid}-glass`}>
              <path d={WINDOW} />
            </clipPath>
          </defs>

          <g transform={`translate(${shake} 0)`}>
            {/* the road */}
            <line x1="0" x2={W} y1={GROUND} y2={GROUND} className="stroke-on-panel-faint/50" strokeWidth="1.5" />
            <line x1="0" x2={WALL_X - 8} y1={GROUND + 12} y2={GROUND + 12} className="stroke-on-panel-faint/25" strokeWidth="2" strokeDasharray="22 26" />

            {/* the wall: the day bitcoin hit bottom */}
            <g transform={`translate(${WALL_X + (hit ? Math.max(0, 2.5 * Math.exp(-14 * tau) * Math.sin(70 * tau)) : 0)} 0)`}>
              <ellipse cx={WALL_W / 2} cy={GROUND + 1} rx={WALL_W * 0.7} ry={4} fill="#000" opacity="0.35" />
              <rect x="0" y={GROUND - WALL_H} width={WALL_W} height={WALL_H} rx="3" fill="#2a2a28" />
              <rect x="0" y={GROUND - WALL_H} width="13" height={WALL_H} rx="2" fill={`url(#${uid}-hazard)`} />
              <rect x="0" y={GROUND - WALL_H} width={WALL_W} height="4" rx="2" className="fill-on-panel-faint/40" />
              <text x={13 + (WALL_W - 13) / 2} y={GROUND - WALL_H + 28} textAnchor="middle" className="fill-on-panel-2 figure" fontSize={phone ? 19 : 18}>
                {facts ? `$${Math.round(facts.crash.low / 1000)}K` : ""}
              </text>
              <text x={13 + (WALL_W - 13) / 2} y={GROUND - WALL_H + 44} textAnchor="middle" className="fill-on-panel-faint" fontSize={phone ? 13 : 10.5} letterSpacing="0.04em">
                {facts ? dayUTC(facts.crash.date).toUpperCase() : ""}
              </text>
            </g>

            {/* speed lines while it lunges */}
            {!hit && speed > 0.25 && (
              <g opacity={clamp((speed - 0.25) / 0.6)} className="stroke-on-panel-faint">
                {[28, 50, 70].map((y, i) => (
                  <line key={y} x1={carX - 16 - (60 - i * 14)} x2={carX - 12} y1={CAR_TOP + y} y2={CAR_TOP + y} strokeWidth="2" strokeLinecap="round" />
                ))}
              </g>
            )}

            {/* the car */}
            <g transform={`translate(${carX} ${CAR_TOP})`}>
              <ellipse cx={110} cy={97} rx={102} ry={5} fill="#000" opacity="0.4" />
              <path d={bodyPath(crumple)} className="fill-on-panel-2" />
              <path d="M 10 70 L 205 70" className="stroke-on-panel-faint/50" strokeWidth="1" transform={`scale(${1 - 0.07 * crumple} 1)`} />
              <path d="M 100 46 L 100 79 M 58 47 L 58 79" className="stroke-[#8a8880]" strokeWidth="1.2" opacity="0.55" />
              <path d={WINDOW} fill="#232321" />
              <path d="M 98 18 L 98 45 L 103 45 L 103 18 Z" className="fill-on-panel-2" />

              {/* inside, behind the glass: the steering wheel, the airbag, and the bitcoin in the driver's seat */}
              <g clipPath={`url(#${uid}-glass)`}>
                <path d="M 146 44 L 140 30" className="stroke-[#8a8880]" strokeWidth="3" strokeLinecap="round" />
                <ellipse cx={139} cy={31} rx={2.6} ry={8} transform="rotate(-24 139 31)" fill="#5c5b56" />
                {inflate > 0 && (
                  <g transform={`translate(136 31) scale(${inflate * squash} ${inflate})`}>
                    <ellipse cx={-6} cy={0} rx={13} ry={13} className="fill-on-panel" />
                    <ellipse cx={-9} cy={-4} rx={5} ry={4} fill="#ffffff" opacity="0.7" />
                  </g>
                )}
                {!shattered && (
                  <g transform={`translate(${SEAT.x + coinDX} ${SEAT.y})`}>
                    <circle r={COIN_R} className="fill-brand" />
                    <circle r={COIN_R - 1.2} fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1.4" />
                    <Bitcoin x={-6.5} y={-6.5} width={13} height={13} color="#fff" strokeWidth={2.6} />
                  </g>
                )}
                {shattered && (
                  // what the sale leaves: the outline of the whole coin, and the tenth of it that is still yours
                  <g transform={`translate(${SEAT.x} ${SEAT.y})`}>
                    <circle r={COIN_R} fill="none" className="stroke-brand" strokeWidth="1.2" strokeDasharray="2.2 2.2" opacity={clamp(k * 2)} />
                    <path d={wedge(-Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * kept)} className="fill-brand" />
                  </g>
                )}
              </g>

              {/* a cracked windscreen when there is no airbag */}
              {shattered && (
                <g className="stroke-on-panel" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity={0.85 * clamp(k * 3)}>
                  <path d="M 148 31 L 141 23 M 148 31 L 154 40 M 148 31 L 141 37 M 148 31 L 152 25 M 144 27 L 140 30 M 151 36 L 147 41" />
                </g>
              )}
              {withBag && outcome && (
                <circle cx={SEAT.x} cy={SEAT.y} r={COIN_R + 4 + 3 * Math.sin(Math.min(tau, 3) * 5)} fill="none" stroke="#3ddc84" strokeWidth="1.6" opacity={0.75} />
              )}
              {pop < 1 && (
                <circle cx={128} cy={31} r={16 + 58 * easeOut(pop)} fill="none" className="stroke-brand" strokeWidth={3 - 2 * pop} opacity={0.9 * (1 - pop)} />
              )}

              <Marker x={80} y={60} r={6.5} />
              <Marker x={30} y={60} r={5} />
              <rect x={7} y={56} width={4} height={8} rx={1.5} className="fill-critical" />
              <rect x={NOSE - 6 - crumpledBy} y={57} width={5} height={7} rx={1.5} fill="#f5e7b8" opacity={1 - crumple * 0.6} />

              {/* wheels */}
              {[53, 161].map((cx) => (
                <g key={cx} transform={`translate(${cx} 80) rotate(${(ride.x * 2400 + (hit ? 0 : 0)) % 360})`}>
                  <circle r={16} fill="#0d0d0c" />
                  <circle r={10.5} fill="none" stroke="#3a3a37" strokeWidth="3" />
                  <circle r={4.5} className="fill-on-panel-faint" />
                  <path d="M -10 0 L 10 0 M 0 -10 L 0 10" stroke="#3a3a37" strokeWidth="2" />
                </g>
              ))}
            </g>

            {/* the impact: a flash at the wall, and the broken pieces of the bitcoin flying out */}
            {hit && tau < 0.4 && (
              <g transform={`translate(${WALL_X - 2} ${CAR_TOP + 62})`} className="stroke-on-panel" strokeLinecap="round" opacity={1 - tau / 0.4}>
                {[-60, -30, 0, 30, 60, 200, 160].map((a) => {
                  const r0 = 8 + 30 * easeOut(clamp(tau / 0.25)), r1 = r0 + 16;
                  const rad = (a * Math.PI) / 180;
                  return <line key={a} x1={-Math.cos(rad) * r0} y1={Math.sin(rad) * r0} x2={-Math.cos(rad) * r1} y2={Math.sin(rad) * r1} strokeWidth="2.5" />;
                })}
              </g>
            )}
            {shattered && k < 1 && (
              <g transform={`translate(${carX + SEAT.x + 15} ${CAR_TOP + SEAT.y})`}>
                {Array.from({ length: 9 }, (_, i) => {
                  const a0 = -Math.PI / 2 + 2 * Math.PI * (kept + (i * (1 - kept)) / 9);
                  const a1 = -Math.PI / 2 + 2 * Math.PI * (kept + ((i + 1) * (1 - kept)) / 9);
                  const mid = (a0 + a1) / 2;
                  const fly = easeOut(k);
                  const dx = Math.cos(mid) * 46 * fly + 70 * fly - 30 * k * k;
                  const dy = Math.sin(mid) * 40 * fly - 26 * fly + 120 * k * k;
                  return (
                    <path key={i} d={wedge(a0, a1)} className="fill-brand" opacity={1 - k} transform={`translate(${dx} ${dy}) rotate(${(i % 2 ? 1 : -1) * 260 * k})`} />
                  );
                })}
              </g>
            )}
          </g>
        </svg>

        {/* the alarm, above the car: the odds passed the limit (Airbag acts on them; without it, nothing does) */}
        {label && (
          <p
            className={cn(
              "pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-semibold shadow-lg sm:text-[13.5px]",
              withBag ? "bg-brand text-white" : "bg-warning text-[#0b0b0b]",
            )}
            style={{ left: `${labelLeft}%`, top: `${labelTop}%` }}
          >
            {!withBag && <TriangleAlert aria-hidden="true" className="mr-1 inline size-3.5 -translate-y-px" strokeWidth={3} />}
            {label}
          </p>
        )}
      </div>

      {/* how it ended, and the way on: a real save, and the real loan */}
      <div className="flex flex-col gap-3.5 border-t border-panel-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="min-h-[3.3rem] min-w-0" aria-live="polite">
          {outcome && facts ? (
            withBag ? (
              <>
                <p className="display text-[1.55rem] text-[#3ddc84] sm:text-[1.8rem]">All 1 bitcoin kept.</p>
                <p className="mt-1 text-[14.5px] leading-snug text-on-panel-2 sm:text-[15.5px]">
                  Airbag paid the loan down from savings on {dayUTC(facts.days[facts.saveIndex].date)}, {facts.daysEarly} days early.
                </p>
              </>
            ) : (
              <>
                <p className="display text-[1.55rem] text-[#ff6b5e] sm:text-[1.8rem]">Sold off. {kept.toFixed(2)} bitcoin left.</p>
                <p className="mt-1 text-[14.5px] leading-snug text-on-panel-2 sm:text-[15.5px]">
                  Bitcoin fell below {usd(facts.line0)}, so {(1 - kept).toFixed(2)} BTC was sold to repay the loan.
                </p>
              </>
            )
          ) : (
            <>
              <p className="display text-[1.55rem] text-on-panel sm:text-[1.8rem]">{facts ? (withBag ? "With Airbag." : "Without Airbag.") : "February 2026."}</p>
              <p className="mt-1 text-[14.5px] leading-snug text-on-panel-2 sm:text-[15.5px]">{facts ? `A ${usd(facts.debt0)} loan against 1 bitcoin, on February's real prices.` : "Loading the replay…"}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          <a href="#save" className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[15px] font-semibold text-white no-underline transition-[filter] hover:brightness-110">
            Watch a real save <ArrowDown aria-hidden="true" className="size-4" />
          </a>
          <a href="/app/" className="inline-flex items-center gap-2 rounded-full bg-panel-3 px-4 py-2.5 text-[15px] font-semibold text-on-panel no-underline transition-colors hover:bg-[#3a3a37]">
            Open the live demo <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
