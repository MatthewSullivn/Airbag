// The landing page's first screen: February 2026's crash, played on a trading chart.
//
// The chart is bitcoin's real daily candles (replay/results.json, through src/crash-test.mjs) and one line: the price
// below which the bitcoin is sold. It plays the week once by itself, slowly, in three steps that stay written under
// it (press one to go to it):
//   with Airbag, the odds pass 5% two days early, an airbag opens under the price and pushes the line down, and the
//   candle of the crash lands on it;
//   without Airbag (the switch above the chart), the very same candle touches the line and the bitcoin is sold.
// Every number comes from the replay. For pictures, ?story=2 in the address holds the story at that point (0 to 3)
// and &run=without shows the other run; with reduced motion (or ?still) nothing plays and the chart shows the ending.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import replay from "@replay";
import { PLAY_SECONDS, STEPS, airbagOpen, candlesAt, crashStory, frameOf, playAt, stepAt, storyKeys, type CrashStory as Story, type Frame, type Scene, type StoryKeys } from "@crash";
import { SERIES, STATUS } from "@/charts/xy-chart";
import { useStill } from "@/lib/chart-kit";
import { dayUTC, usd, usdK } from "@/lib/format";
import { cn } from "@/lib/utils";

const STORY = crashStory(replay);
const ORANGE = SERIES.s1, UP = SERIES.s3, DOWN = STATUS.critical;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

// What the chart shows at each point of the story (candlesAt, playAt, frameOf) lives in src/crash-test.mjs, where the
// tests walk both runs against the replay. This file draws it.

// ------------------------------------------------------------------ small hooks

const HOLD = (() => {
  if (typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search);
  const raw = q.get("story");
  const v = raw == null ? NaN : Number(raw);
  return Number.isFinite(v) ? { u: clamp(v, 0, STEPS), airbag: q.get("run") !== "without" } : null;
})();

/** A number that eases to its target over `ms` (at once when motion is off). */
function useEased(target: number, ms: number, still: boolean, ease: (x: number) => number = easeOut) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (still || from === target) { cur.current = target; setV(target); return; }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const k = clamp((now - t0) / ms);
      cur.current = from + (target - from) * ease(k);
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms, still, ease]);
  return v;
}

/** The element's size in pixels, so the chart is drawn at its real size and its text stays sharp. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener("resize", measure);
    return () => { ro.disconnect(); removeEventListener("resize", measure); };
  }, []);
  return [ref, size] as const;
}

// ------------------------------------------------------------------ the chart

/** A closed shape through these corners, each rounded by r (or less where an edge is short). */
function rounded(pts: [number, number][], r: number, close: boolean) {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!close && (i === 0 || i === n - 1)) { d += `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)} `; continue; }
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, la / 2), rb = Math.min(r, lb / 2);
    const inX = la ? p[0] + ((a[0] - p[0]) * ra) / la : p[0], inY = la ? p[1] + ((a[1] - p[1]) * ra) / la : p[1];
    const outX = lb ? p[0] + ((b[0] - p[0]) * rb) / lb : p[0], outY = lb ? p[1] + ((b[1] - p[1]) * rb) / lb : p[1];
    d += `${i ? "L" : "M"} ${inX.toFixed(1)} ${inY.toFixed(1)} Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${outX.toFixed(1)} ${outY.toFixed(1)} `;
  }
  return d + (close ? "Z" : "");
}

function Plot({ story, scene, frame, pop, flash, thud, uid }: {
  story: Story;
  scene: Scene;
  frame: Frame;
  pop: number;
  /** 1 at the moment of the sale, fading to 0. */
  flash: number;
  /** 1 at the moment bitcoin lands on the airbag, fading to 0. */
  thud: number;
  uid: string;
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const { days, saveIndex: save, crashIndex: crash, line0 } = story;
  const { N, full, forming, cur, candle, price, levelAt, level, sold, landed, cushion, inLoan } = frame;
  const phone = w < 520;
  const M = { l: 4, r: phone ? 54 : 70, t: 10, b: 26 };
  const pw = Math.max(10, w - M.l - M.r), ph = Math.max(10, h - M.t - M.b);
  const xr = M.l + pw, yb = M.t + ph;
  const stepX = pw / N;
  const X = (i: number) => M.l + (i + 0.5) * stepX;
  const left = (i: number) => M.l + i * stepX;
  const [lo, hi] = useMemo(() => {
    const top = Math.ceil((Math.max(...days.map((d) => d.high)) + 500) / 2500) * 2500;
    const bottom = Math.floor((Math.min(...days.map((d) => Math.min(d.low, d.line))) - 2500) / 2500) * 2500;
    return [bottom, top];
  }, [days]);
  const Y = (p: number) => M.t + ((hi - p) / (hi - lo)) * ph;
  const ticks = useMemo(() => { const out: number[] = []; for (let v = Math.ceil((lo + 1) / 10_000) * 10_000; v < hi; v += 10_000) out.push(v); return out; }, [lo, hi]);
  const money = (v: number) => (phone ? `$${(v / 1000).toFixed(1)}K` : usd(v));

  const y0 = Y(line0), yLine = Y(level), yPrice = Y(price);
  const bw = clamp(stepX * 0.62, 3, 15);
  // the line: flat at the old level, then (with Airbag) down a step for each day Airbag moved it, then on to the edge
  const linePts: [number, number][] = [[M.l, y0]];
  if (cushion) {
    linePts.push([left(save), y0]);
    for (let i = save; i <= cur; i++) linePts.push([left(i), Y(levelAt(i))], [left(i + 1), Y(levelAt(i))]);
    linePts[linePts.length - 1] = [xr, yLine];
  } else linePts.push([xr, y0]);
  const linePath = rounded(linePts, 7, false);
  // the airbag: everything between where the line was and where it is now
  const bagPts: [number, number][] = cushion ? [[left(save), y0], [xr, y0], ...linePts.slice(2).reverse()] : [];
  const thick = yLine - y0;                    // how thick the airbag is at the day on screen, in pixels
  const bagMidX = cushion ? (Math.max(left(save + 1), left(save)) + xr) / 2 : 0;

  // the tags on the price axis keep clear of each other
  const yPriceTag = Math.abs(yPrice - yLine) < 23 ? yLine + (yPrice > yLine ? 23 : -23) : yPrice;
  const room = price - level;
  // the room is drawn until the airbag opens: after that the airbag itself is the picture of it
  const showRoom = !sold && !cushion && room > 0;
  const roomRight = X(cur) + bw / 2 + 96 < xr;
  const xRoom = X(cur) + (roomRight ? 1 : -1) * (bw / 2 + 10);
  const tight = room / price < 0.04;
  const xDate = clamp(X(cur), M.l + 22, xr - 22);

  const label = sold
    ? `Without Airbag: on ${dayUTC(days[crash].date)} bitcoin touched ${usd(line0)} and the bitcoin was sold.`
    : scene.airbag
      ? `With Airbag: bitcoin at ${usd(price)} on ${dayUTC(days[cur].date)}. The bitcoin is sold only below ${usd(level)}.`
      : `Without Airbag: bitcoin at ${usd(price)} on ${dayUTC(days[cur].date)}. The bitcoin is sold below ${usd(line0)}.`;

  return (
    <div ref={ref} className="relative min-h-0 flex-1">
      {w > 0 && (
        <svg width={w} height={h} className="block" role="img" aria-label={label}>
          <defs>
            <pattern id={`${uid}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke={ORANGE} strokeWidth="1.5" opacity="0.22" />
            </pattern>
            <linearGradient id={`${uid}-bag`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#dcd9cf" />
            </linearGradient>
            <clipPath id={`${uid}-plot`}>
              <rect x={M.l} y={M.t - 4} width={pw} height={ph + 4} />
            </clipPath>
          </defs>

          {/* the price grid */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={xr} y1={Y(v)} y2={Y(v)} stroke="var(--on-panel)" strokeOpacity="0.07" />
              <text x={xr + 9} y={Y(v) + 4} fontSize="11.5" className="fill-on-panel-faint">{usdK(v)}</text>
            </g>
          ))}

          <g clipPath={`url(#${uid}-plot)`}>
            {/* below the line, the bitcoin is sold */}
            <path d={`${rounded(linePts, 7, false)} L ${xr} ${yb} L ${M.l} ${yb} Z`} fill={`url(#${uid}-hatch)`} />

            {/* the airbag */}
            {cushion && (
              <>
                {/* a dark edge all round it, so it stands clear of the two lines it sits between */}
                <path d={rounded(bagPts, 9, true)} fill={`url(#${uid}-bag)`} stroke="var(--panel)" strokeWidth={phone ? 7 : 9} strokeLinejoin="round" />
                {/* where the line was: above the airbag */}
                <line x1={left(save) + 6} x2={xr} y1={y0} y2={y0} stroke={ORANGE} strokeWidth="2" strokeDasharray="6 5" />
              </>
            )}

            {/* the moment it opens: the day the odds pass the limit */}
            {cushion && pop > 0.5 && (
              <line x1={X(save)} x2={X(save)} y1={M.t + (phone ? 20 : 24)} y2={Y(days[save].high) - 6} stroke="var(--on-panel)" strokeOpacity="0.35" strokeDasharray="3 4" />
            )}

            {/* bitcoin, one candle a day */}
            {days.map((d, i) => {
              if (i > full || (i === full && !forming)) return null;
              const c = i === full ? candle : d;
              const up = c.close >= c.open;
              const top = Y(Math.max(c.open, c.close)), bottom = Y(Math.min(c.open, c.close));
              return (
                <g key={d.date} opacity={sold && i > crash ? 0.38 : i === cur ? 1 : 0.86}>
                  <line x1={X(i)} x2={X(i)} y1={Y(c.high)} y2={Y(c.low)} stroke={up ? UP : DOWN} strokeWidth="1.5" />
                  <rect x={X(i) - bw / 2} y={top} width={bw} height={Math.max(1.5, bottom - top)} rx="1" fill={up ? UP : DOWN} />
                </g>
              );
            })}

            {/* the line itself */}
            <path d={linePath} fill="none" stroke={ORANGE} strokeWidth="3" strokeLinejoin="round" />

            {/* the sale: the whole chart flashes */}
            {flash > 0.01 && <rect x={M.l} y={M.t} width={pw} height={ph} fill={DOWN} opacity={0.28 * flash} />}
          </g>

          {/* words on the chart */}
          {cushion && thick > 30 && pop > 0.8 && (
            <text x={bagMidX} y={(y0 + yLine) / 2 + (thick > 52 ? -3 : 5)} textAnchor="middle" fill="#1b1b1a">
              <tspan fontSize={phone ? 14 : 17} fontWeight="700">Airbag</tspan>
              {thick > 52 && <tspan x={bagMidX} dy={phone ? 16 : 19} fontSize={phone ? 11.5 : 13}>{phone ? usd(inLoan) : `${usd(inLoan)} of your savings`}</tspan>}
            </text>
          )}
          <text x={M.l + 6} y={y0 - 9} fontSize={phone ? 12 : 13.5} fontWeight="600" fill={ORANGE}>
            {cushion && pop > 0.8
              ? (phone ? "No Airbag: sold here" : "Without Airbag: sold at this line")
              : (phone ? "Sold below this line" : "Your bitcoin is sold below this line")}
          </text>
          {cushion && pop > 0.8 && (
            <>
              {yb - yLine > 22 && (
                <text x={xr - 8} y={yLine + 16} textAnchor="end" fontSize={phone ? 11.5 : 12.5} fontWeight="600" fill={ORANGE}>
                  {phone ? "Now sold only below here" : "With Airbag, sold only below here"}
                </text>
              )}
              <text x={X(save) + 8} y={M.t + (phone ? 12 : 14)} fontSize={phone ? 11.5 : 12.5} className="fill-on-panel-2">
                {dayUTC(days[save].date)}: odds pass 5%
              </text>
            </>
          )}

          {/* how far bitcoin is above the line: the room it has to fall */}
          {showRoom && (
            <g stroke={tight ? STATUS.warning : "var(--good)"} strokeWidth="2" strokeLinecap="round">
              <line x1={xRoom} x2={xRoom} y1={yPrice} y2={yLine} />
              <line x1={xRoom - 4} x2={xRoom + 4} y1={yPrice} y2={yPrice} />
              <line x1={xRoom - 4} x2={xRoom + 4} y1={yLine} y2={yLine} />
              <text x={xRoom + (roomRight ? 9 : -9)} y={clamp((yPrice + yLine) / 2 + 4, M.t + 12, yb - 4)} textAnchor={roomRight ? "start" : "end"} stroke="none" fontSize={phone ? 12 : 13} fontWeight="600" fill={tight ? STATUS.warning : "var(--good)"}>
                {usd(room)} room
              </text>
            </g>
          )}

          {/* the sale, and the landing */}
          {sold && (
            <g transform={`translate(${X(crash)} ${y0})`}>
              {flash > 0.01 && <circle r={12 + 34 * (1 - flash)} fill="none" stroke={DOWN} strokeWidth="2" opacity={flash} />}
              <circle r="11" fill={DOWN} stroke="var(--panel)" strokeWidth="2" />
              <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" />
              <text y={30} textAnchor="middle" fontSize={phone ? 12 : 13} fontWeight="700" fill="#ff7a6e">Sold</text>
            </g>
          )}
          {landed && cushion && (
            <g transform={`translate(${X(crash)} ${Y(days[crash].low)})`}>
              {thud > 0.01 && <circle r={9 + 30 * (1 - thud)} fill="none" stroke="var(--good)" strokeWidth="2.5" opacity={thud} />}
              <circle r="7" fill="var(--good)" stroke="#fff" strokeWidth="2" />
              <path d="M -3 0.2 L -0.8 2.4 L 3.2 -2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}

          {/* on the price axis: the line, and bitcoin now */}
          <line x1={X(cur) + bw / 2 + 3} x2={xr} y1={yPrice} y2={yPrice} stroke="var(--on-panel)" strokeOpacity="0.28" strokeDasharray="2 4" />
          <g transform={`translate(${xr + 4} ${yPriceTag})`}>
            <rect y="-10.5" width={M.r - 8} height="21" rx="5" fill="var(--panel-3)" />
            <text x={(M.r - 8) / 2} y="4" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-on-panel">{money(price)}</text>
          </g>
          <g transform={`translate(${xr + 4} ${yLine})`}>
            <rect y="-10.5" width={M.r - 8} height="21" rx="5" fill={ORANGE} />
            <text x={(M.r - 8) / 2} y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1f0e05">{money(level)}</text>
          </g>

          {/* the days */}
          {days.map((d, i) => (i % 7 === 3 && Math.abs(X(i) - xDate) > 48 ? (
            <text key={d.date} x={X(i)} y={yb + 18} textAnchor="middle" fontSize="11.5" className="fill-on-panel-faint">{dayUTC(d.date)}</text>
          ) : null))}
          <text x={xDate} y={yb + 18} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-on-panel">{dayUTC(days[cur].date)}</text>
          <line x1={X(cur)} x2={X(cur)} y1={yb} y2={yb + 5} stroke="var(--on-panel)" strokeOpacity="0.6" />
        </svg>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the story

export function CrashStory({ children }: {
  /** The page's headline, its sentence and its buttons, beside the chart. */
  children: React.ReactNode;
}) {
  const story = STORY;
  const still = useStill();
  const panel = useRef<HTMLDivElement>(null);
  const uid = "story" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const K = useMemo<StoryKeys>(() => (story ? storyKeys(story) : { N: 1, calm: 0, save: 0, crash: 0 }), [story]);

  const [airbag, setAirbag] = useState(HOLD ? HOLD.airbag : true);
  const [u, setU] = useState(HOLD ? HOLD.u : still ? STEPS : 0);   // where the story is: 0 to 3
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (still) { setPlaying(false); setU(STEPS); return; }
    const t0 = performance.now();
    setPlaying(true);
    setU(0);
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= PLAY_SECONDS) { setU(STEPS); setPlaying(false); return; }
      setU(playAt(t));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [still]);
  /** Go to the end of a step and stay there. */
  const goTo = (step: number) => { cancelAnimationFrame(raf.current); setPlaying(false); setU(step); };
  const choose = (on: boolean) => { setAirbag(on); play(); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { if (still && !HOLD) { cancelAnimationFrame(raf.current); setPlaying(false); setU(STEPS); } }, [still]);

  // It plays once by itself, with Airbag, when the chart is on screen.
  const started = useRef(false);
  useEffect(() => {
    if (HOLD || still || started.current) return;
    const el = panel.current;
    if (!el) return;
    const go = () => { if (!started.current) { started.current = true; play(); } };
    if (typeof IntersectionObserver === "undefined") { go(); return; }
    const io = new IntersectionObserver((seen) => { if (seen.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [still, play]);

  const scene: Scene = { n: candlesAt(u, K), airbag };
  const open = airbagOpen(scene, K);
  const pop = useEased(open ? 1 : 0, open ? 560 : 260, still, open ? easeOutBack : easeOut);
  const frame = useMemo(() => (story ? frameOf(story, scene, pop) : null), [story, scene.n, scene.airbag, pop]); // eslint-disable-line react-hooks/exhaustive-deps
  const sold = !!frame?.sold;
  const yours = useEased(sold && story ? story.btcKept : 1, 650, still);
  const soldFor = useEased(sold ? 1 : 0, 620, still);
  const flash = sold ? 1 - soldFor : 0;
  const landed = !!frame?.landed;
  const landedFor = useEased(landed ? 1 : 0, 620, still);
  const thud = landed ? 1 - landedFor : 0;

  if (!story || !frame) return <section className="pb-10 pt-12 sm:pt-20">{children}</section>;

  const { days, saveIndex: save, crashIndex: crash, line0, debt0, savings, btcKept } = story;
  const before = days[crash - 1], crashDay = days[crash], saveDay = days[save], last = days[days.length - 1];
  // the same three steps for both runs: the fall, the day of the crash, the days after
  const steps: { head: string; text: string }[] = airbag
    ? [
        { head: `${dayUTC(saveDay.date)}: the odds pass 5%`, text: `The airbag opens: ${usd(before.inLoan)} of your savings pay the loan down.` },
        { head: `${dayUTC(crashDay.date)}: bitcoin hits ${usd(crashDay.low)}`, text: "It lands on the airbag. Nothing is sold." },
        { head: "You keep your bitcoin", text: `Without Airbag: ${btcKept.toFixed(2)} BTC left.` },
      ]
    : [
        { head: "Bitcoin falls for a week", text: `Only ${usd(before.close - line0)} of room is left above your line.` },
        { head: `${dayUTC(crashDay.date)}: it touches the line`, text: `${(1 - btcKept).toFixed(2)} of your bitcoin is sold, near the bottom.` },
        { head: "Bitcoin comes back", text: `Yours is gone: ${btcKept.toFixed(2)} BTC left.` },
      ];
  const at = stepAt(u);
  const day = days[frame.cur];
  const room = frame.price - frame.level;

  return (
    <section aria-label="February 2026's crash, with and without Airbag">
      <div className="story lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.32fr)] lg:items-center lg:gap-x-12 lg:pt-8 xl:gap-x-14">
        {/* the headline */}
        <div className="pb-6 pt-8 sm:pb-9 sm:pt-14 lg:py-0">{children}</div>

        {/* the chart, and the story's three steps under it */}
        <div ref={panel} id="how" className="scroll-mt-20">
          <div className="flex flex-col overflow-hidden rounded-[22px] border border-panel-line bg-panel text-on-panel shadow-[0_30px_60px_-34px_rgb(0_0_0/0.5)] lg:h-[var(--stage-h)] lg:rounded-[26px]">
            <div className="flex items-center justify-between gap-3 px-3.5 pt-3.5 sm:px-5 sm:pt-5">
              {/* which run is on the chart; pressing one plays it */}
              <div role="group" aria-label="Which run the chart shows" className="inline-flex rounded-full bg-panel-2 p-1 text-[13px] font-semibold sm:text-[14px]">
                <button type="button" aria-pressed={!airbag} onClick={() => choose(false)} className={cn("rounded-full px-3 py-1.5 transition-colors sm:px-3.5", airbag ? "text-on-panel-faint hover:text-on-panel" : "bg-panel-3 text-on-panel")}>Without Airbag</button>
                <button type="button" aria-pressed={airbag} onClick={() => choose(true)} className={cn("rounded-full px-3 py-1.5 transition-colors sm:px-3.5", airbag ? "bg-brand text-white" : "text-on-panel-faint hover:text-on-panel")}>With Airbag</button>
              </div>
              <div className="flex items-center gap-3">
                <p className="hidden text-[13.5px] text-on-panel-faint xl:block">February 2026, real prices</p>
                <button type="button" onClick={play} aria-label="Play it again" className="inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-2.5 py-2 text-[13px] font-semibold text-on-panel transition-colors hover:bg-panel-3 sm:px-3 sm:py-1.5 sm:text-[14px]">
                  <RotateCcw size={15} aria-hidden className={cn(playing && "opacity-50")} />
                  <span className="hidden sm:inline">{playing ? "Playing" : "Play again"}</span>
                </button>
              </div>
            </div>

            {/* the read-outs: they run as the chart does */}
            <dl className="flex items-end justify-between gap-4 px-4 pb-1 pt-3 sm:px-5 sm:pt-4">
              <div>
                <dt className="text-[13px] text-on-panel-faint sm:text-[14px]">Bitcoin, {dayUTC(day.date)}</dt>
                <dd className="figure mt-1.5 text-[1.9rem] tabular-nums text-on-panel sm:text-[2.5rem]">{usd(frame.price)}</dd>
              </div>
              <div className="hidden text-center sm:block">
                <dt className="text-[14px] text-on-panel-faint">Room above your line</dt>
                <dd className={cn("figure mt-1.5 text-[2.5rem] tabular-nums", sold ? "text-[#ff7a6e]" : room / frame.price < 0.04 ? "text-warning" : "text-on-panel")}>{sold ? "none" : usd(room)}</dd>
              </div>
              <div className="text-right">
                <dt className="text-[13px] text-on-panel-faint sm:text-[14px]">Your bitcoin</dt>
                <dd className={cn("figure mt-1.5 text-[1.9rem] tabular-nums transition-colors duration-300 sm:text-[2.5rem]", sold ? "text-[#ff7a6e]" : frame.landed ? "text-[#3ddc84]" : "text-on-panel")}>
                  {yours >= 0.995 ? "1" : yours.toFixed(2)} BTC
                </dd>
              </div>
            </dl>

            <div className="flex h-[var(--plot-h)] shrink-0 px-2 sm:px-3 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
              <Plot story={story} scene={scene} frame={frame} pop={pop} flash={flash} thud={thud} uid={uid} />
            </div>

            {/* the three steps: always written out, so nothing has to be read in a hurry; pressing one goes to it */}
            <ol className="grid gap-2 p-3 pt-2 sm:grid-cols-3 sm:p-4 sm:pt-2">
              {steps.map((st, i) => {
                const current = at === i + 1, reached = i + 1 <= at;
                return (
                  <li key={st.head}>
                    <button
                      type="button"
                      onClick={() => goTo(i + 1)}
                      aria-current={current ? "step" : undefined}
                      className={cn("block h-full w-full rounded-2xl border px-3.5 py-2.5 text-left transition-[background-color,border-color,opacity] duration-300", current ? "border-on-panel/30 bg-panel-3" : "border-panel-line hover:bg-panel-2", !reached && "opacity-55")}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className={cn("grid size-[1.35rem] shrink-0 translate-y-[1px] place-items-center self-start rounded-full text-[12.5px] font-bold tabular-nums", current ? (airbag ? "bg-brand text-white" : "bg-[#ff7a6e] text-[#2a0d09]") : "bg-panel-2 text-on-panel-2")}>{i + 1}</span>
                        <span className="text-[16px] font-semibold leading-snug text-on-panel sm:text-[15.5px]">{st.head}</span>
                      </span>
                      <span className="mt-1 block text-[14.5px] leading-snug text-on-panel-2 sm:text-[14px]">{st.text}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      {/* how it was made, and the same story as a table */}
      <div className="pb-4 pt-5 text-[15px] leading-relaxed text-ink-2 lg:pt-7">
        <p className="max-w-[86ch]">
          A loan of {usd(debt0)} against 1 bitcoin, with {usd(savings)} in savings, replayed on bitcoin's real daily prices with the bot's own rule. The bitcoin is sold if its price touches {usd(line0)}, even for a minute. No Gemini prices exist for February, so the odds in this replay are worked out from bitcoin's own swings.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer select-none font-semibold text-ink">See every day as a table</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-line text-ink">
                  {["Day", "Bitcoin's low", "Sold below, left alone", "Sold below, with Airbag", "Savings in the loan"].map((h) => <th key={h} className="py-2 pr-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {days.map((d, i) => (
                  <tr key={d.date} className="border-b border-line">
                    <td className="py-1.5 pr-4">{dayUTC(d.date)}</td>
                    <td className="py-1.5 pr-4">{usd(d.low)}</td>
                    <td className="py-1.5 pr-4">{i < crash ? usd(line0) : i === crash ? `${usd(line0)}: sold` : "sold"}</td>
                    <td className="py-1.5 pr-4">{usd(d.line)}</td>
                    <td className="py-1.5 pr-4">{usd(d.inLoan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
