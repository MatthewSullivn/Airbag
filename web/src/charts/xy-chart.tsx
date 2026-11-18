// One chart for every line picture on the page: odds over time, bitcoin against the line, Gemini's ladder,
// the crash replay. Built on tweenly's chart kit (same halftone fills, draw-in and crosshair as its ChartLine),
// with what our data needs on top: a real x scale, threshold lines, shaded ranges, event markers and a table view.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { linePath, useChartReveal, type ChartCurve, type ChartTheme, type Point } from "@/lib/chart-kit";
import { cn } from "@/lib/utils";

/** The instrument panel as a chart surface. The series colours were checked against this background. */
export const PANEL_THEME: ChartTheme = {
  surface: "dark",
  bg: "#161616",
  fg: "#f5f4f0",
  muted: "#8a8880",
  subtle: "#3a3a38",
  grid: "rgb(255 255 255 / 0.07)",
  track: "#262624",
  border: "rgb(255 255 255 / 0.10)",
  accent: "#f0591f",
  tooltipBg: "#0d0d0d",
};
/** Fixed order: 1 orange, 2 blue, 3 aqua. Status colours are separate and never used for a series. */
export const SERIES = { s1: "#f0591f", s2: "#3987e5", s3: "#199e70" } as const;
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;

export interface XYSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** Area under the line. Default: none */
  fill?: "dots" | "none";
  curve?: ChartCurve;
  dashed?: boolean;
  /** Write the last value next to the end of the line. */
  endLabel?: string;
}
export interface XYRef { y: number; label: string; color: string; /** Which end of the line the words sit at. Default: the right end. */ labelAt?: "start" | "end" }
export interface XYVLine { x: number; label: string; color: string; dashed?: boolean }
export interface XYBand {
  x0?: number; x1?: number; y0?: number; y1?: number; color: string; label?: string;
  /** Hide any area fill underneath, so the band reads as one clean zone. The lines still show on top. */
  cover?: boolean;
}
export interface XYMarker {
  x: number; y: number; color: string; shape?: "dot" | "cross" | "tick"; label?: string;
  /** On a narrow chart, name this mark under the chart instead of beside it (where it would sit on the data). */
  legend?: boolean;
}
/** A level with everything under it shaded as one zone ("lost below here"). The zone glides when the level moves. */
export interface XYFloor { y: number; color: string; label?: string; /** Drawn heavier: the level is dangerously close. */ strong?: boolean }
/** A bracket right of the plot between two levels, with the size of the gap written beside it. It glides too. */
export interface XYGap { from: number; to: number; color: string; label: string; sub?: string }
export interface XYTip { title: string; rows: { label: string; value: string; color: string }[]; note?: string }

export interface XYChartProps {
  xs: number[];
  series: XYSeries[];
  xDomain?: [number, number];
  yDomain: [number, number];
  yTicks: number[];
  xTicks: number[];
  yFormat: (v: number) => string;
  xFormat: (v: number) => string;
  refs?: XYRef[];
  vlines?: XYVLine[];
  bands?: XYBand[];
  markers?: XYMarker[];
  floor?: XYFloor;
  gap?: XYGap;
  tip?: (i: number) => XYTip;
  height?: number;
  /** Extra room right of the plot, for end labels. */
  padRight?: number;
  /** A soft pulse on the last point of the first series: "this is live". */
  pulse?: boolean;
  ariaLabel: string;
  /** The same data as a table, for people who cannot read the picture. */
  table?: { head: string[]; rows: string[][] };
  /** The cards that name their two lines next to the big numbers do not need the legend again. */
  hideLegend?: boolean;
  className?: string;
}

const EASE = [0.65, 0, 0.35, 1] as const;
const r2 = (v: number) => Math.round(v * 100) / 100;

function useWidth<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** A handful of round clock times between two moments, never more than max of them. */
export function timeTicks(from: number, to: number, max = 5) {
  const steps = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
  const step = steps.find((s) => (to - from) / s <= max) ?? steps[steps.length - 1];
  const out: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(t);
  return out;
}

function nearest(xs: number[], x: number) {
  if (!xs.length) return 0;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

export function XYChart({
  xs, series, xDomain, yDomain, yTicks, xTicks, yFormat, xFormat, refs = [], vlines = [], bands = [], markers = [],
  floor, gap, tip, height = 220, padRight = 14, pulse = false, ariaLabel, table, hideLegend = false, className,
}: XYChartProps) {
  const theme = PANEL_THEME;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { ref, shown, still } = useChartReveal(true, true);
  const width = useWidth(ref);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = xs.length;
  const [x0, x1] = xDomain ?? [xs[0] ?? 0, xs[n - 1] ?? 1];
  const [y0, y1] = yDomain;
  const padT = 14;
  const padL = Math.max(...yTicks.map((t) => yFormat(t).length), 1) * 7.4 + 16;
  const plotW = Math.max(width - padL - padRight, 1);
  const plotH = height - padT;
  const svgH = height + 26;
  const X = (v: number) => r2(padL + ((v - x0) / (x1 - x0 || 1)) * plotW);
  const Y = (v: number) => r2(padT + (1 - (v - y0) / (y1 - y0 || 1)) * plotH);
  const baseY = Y(y0);
  const inY = (v: number) => Y(Math.min(Math.max(v, y0), y1));
  // on a narrow screen the time or price labels would run into each other: show every second or third one
  const xLabelW = Math.max(...xTicks.map((t) => xFormat(t).length), 1) * 7.4 + 14;
  const everyX = Math.max(1, Math.ceil((xTicks.length * xLabelW) / plotW));
  // on a phone there is no room for words inside the plot: they move under the chart
  const narrow = width > 0 && width < 560;
  const halo = { paintOrder: "stroke" as const, stroke: theme.bg, strokeWidth: 4, strokeLinejoin: "round" as const };

  const paths = useMemo(
    () =>
      series.map((s) => {
        // a gap in the data breaks the line instead of drawing through it
        const runs: Point[][] = [];
        let run: Point[] = [];
        s.values.forEach((v, i) => {
          if (v == null || !Number.isFinite(v)) {
            if (run.length) runs.push(run);
            run = [];
          } else run.push([X(xs[i]), Y(Math.min(Math.max(v, y0), y1))]);
        });
        if (run.length) runs.push(run);
        const line = runs.map((pts) => linePath(pts, s.curve ?? "linear")).join("");
        const area = runs.map((pts) => (pts.length > 1 ? `${linePath(pts, s.curve ?? "linear")}L${pts[pts.length - 1][0]},${baseY}L${pts[0][0]},${baseY}Z` : "")).join("");
        const lastRun = runs[runs.length - 1];
        return { s, line, area, end: lastRun ? lastRun[lastRun.length - 1] : null };
      }),
    // X and Y depend only on these
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, xs, x0, x1, y0, y1, width, height, padL, padRight],
  );

  const tracking = !!tip && n > 0;
  const idx = active !== null && active < n ? active : null;
  const tipData = idx !== null && tip ? tip(idx) : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!tracking) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setActive(nearest(xs, x0 + ((px - padL) / plotW) * (x1 - x0)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!tracking) return;
    const moves: Record<string, (a: number | null) => number | null> = {
      ArrowRight: (a) => (a === null ? n - 1 : Math.min(n - 1, a + 1)),
      ArrowLeft: (a) => (a === null ? n - 1 : Math.max(0, a - 1)),
      Home: () => 0,
      End: () => n - 1,
      Escape: () => null,
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setActive(move);
  };

  const t = (d: number, extra: object = {}) => (still ? { duration: 0 } : { duration: d, ease: EASE, ...extra });
  const band = (b: XYBand, i: number) => {
    const bx0 = X(b.x0 ?? x0), bx1 = X(b.x1 ?? x1), by0 = Y(b.y1 ?? y1), by1 = Y(b.y0 ?? y0);
    const box = { x: Math.min(bx0, bx1), y: Math.min(by0, by1), width: Math.abs(bx1 - bx0), height: Math.abs(by1 - by0) };
    return (
      <g key={`band-${i}`} clipPath={`url(#${uid}-plot)`}>
        {b.cover && <rect {...box} fill={theme.bg} />}
        <rect {...box} fill={b.color} opacity={0.1} />
        <rect {...box} fill={`url(#${uid}-hatch-${i})`} opacity={0.5} />
        {b.label && (
          <text x={box.x + 8} y={box.y + 15} fontSize={11} fill={theme.fg} opacity={0.85}>
            {b.label}
          </text>
        )}
      </g>
    );
  };
  // what moves under the chart on a narrow screen
  const below = narrow
    ? [
        ...vlines.map((v) => ({ kind: "vline" as const, label: v.label, color: v.color })),
        ...markers.filter((m) => m.legend && m.label).map((m) => ({ kind: "dot" as const, label: m.label as string, color: m.color })),
      ]
    : [];
  const showSeries = series.length > 1 && !hideLegend;
  const first = paths[0];

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={ref}
        tabIndex={tracking ? 0 : undefined}
        role="img"
        aria-label={ariaLabel}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="relative w-full touch-pan-y select-none rounded-md outline-offset-4"
        style={{ height: svgH }}
      >
        {width > 0 && (
          <svg ref={svgRef} width={width} height={svgH} className="block overflow-visible" onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
            <defs>
              <clipPath id={`${uid}-reveal`}>
                <motion.rect x={0} y={-20} height={svgH + 40} initial={still ? false : { width: 0 }} animate={{ width: shown ? width + 20 : 0 }} transition={t(0.9)} />
              </clipPath>
              <clipPath id={`${uid}-plot`}>
                <rect x={padL} y={padT - 6} width={plotW} height={plotH + 6} />
              </clipPath>
              {series.map((s, i) => (
                <pattern key={s.key} id={`${uid}-dots-${i}`} width="5" height="5" patternUnits="userSpaceOnUse">
                  <circle cx="1.25" cy="1.25" r="1.05" fill={s.color} />
                  <circle cx="3.75" cy="3.75" r="1.05" fill={s.color} />
                </pattern>
              ))}
              {floor && (
                <pattern id={`${uid}-floor`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="7" stroke={floor.color} strokeWidth="1.5" opacity="0.75" />
                </pattern>
              )}
              {bands.map((b, i) => (
                <pattern key={i} id={`${uid}-hatch-${i}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="7" stroke={b.color} strokeWidth="1.4" opacity="0.7" />
                </pattern>
              ))}
            </defs>

            {yTicks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={width - padRight} y1={Y(v)} y2={Y(v)} stroke={theme.grid} />
                <text x={padL - 10} y={Y(v)} textAnchor="end" dominantBaseline="middle" fontSize={12.5} fill={theme.muted} className="tabular-nums">
                  {yFormat(v)}
                </text>
              </g>
            ))}
            {xTicks.map((v, i) => i % everyX !== 0 ? null : (
              <text key={v} x={X(v)} y={height + 20} textAnchor="middle" fontSize={12.5} fill={theme.muted} className="tabular-nums">
                {xFormat(v)}
              </text>
            ))}

            {bands.map((b, i) => (b.cover ? null : band(b, i)))}

            {/* the floor: one group that slides up and down, so a jump of the level is seen as a move */}
            {floor && (
              <g clipPath={`url(#${uid}-plot)`}>
                <motion.g initial={false} animate={{ y: inY(floor.y) }} transition={t(0.7)}>
                  <rect x={padL} y={0} width={plotW} height={svgH} fill={floor.color} opacity={floor.strong ? 0.22 : 0.1} />
                  <rect x={padL} y={0} width={plotW} height={svgH} fill={`url(#${uid}-floor)`} opacity={floor.strong ? 0.8 : 0.5} />
                  <line x1={padL} x2={padL + plotW} y1={0} y2={0} stroke={floor.color} strokeWidth={2.25} />
                  {floor.label && (
                    <text x={padL + 10} y={19} fontSize={12.5} fill={theme.fg} {...halo}>
                      {floor.label}
                    </text>
                  )}
                </motion.g>
              </g>
            )}

            <g clipPath={`url(#${uid}-reveal)`}>
              {paths.map((p, i) =>
                p.s.fill === "dots" && p.area ? (
                  <g key={p.s.key} clipPath={`url(#${uid}-plot)`} opacity={0.6}>
                    <path d={p.area} fill={p.s.color} opacity={0.1} />
                    <path d={p.area} fill={`url(#${uid}-dots-${i})`} opacity={0.8} />
                  </g>
                ) : null,
              )}
              {bands.map((b, i) => (b.cover ? band(b, i) : null))}
              {paths.map((p) => (
                <path key={p.s.key} d={p.line} fill="none" stroke={p.s.color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={p.s.dashed ? "5 5" : undefined} />
              ))}
            </g>

            {refs.map((r) => (
              <g key={r.label}>
                <line x1={padL} x2={width - padRight} y1={Y(r.y)} y2={Y(r.y)} stroke={r.color} strokeWidth={1.25} strokeDasharray="4 4" />
                <text x={r.labelAt === "start" ? padL + 6 : width - padRight} y={Y(r.y) - 6} textAnchor={r.labelAt === "start" ? "start" : "end"} fontSize={12.5} fill={theme.fg} {...halo}>
                  {r.label}
                </text>
              </g>
            ))}
            {vlines.map((v) => {
              const vx = X(v.x);
              const left = vx > padL + plotW * 0.6;
              return (
                <g key={v.label}>
                  <line x1={vx} x2={vx} y1={padT - 4} y2={height} stroke={v.color} strokeWidth={1.5} strokeDasharray={v.dashed ? "3 4" : undefined} />
                  {!narrow && (
                    <text x={left ? vx - 8 : vx + 8} y={padT + plotH * 0.42} textAnchor={left ? "end" : "start"} fontSize={13} fontWeight={600} fill={theme.fg} {...halo}>
                      {v.label}
                    </text>
                  )}
                </g>
              );
            })}

            {markers.map((m, i) => (
              <g key={i} transform={`translate(${X(m.x)},${Y(m.y)})`}>
                {m.shape === "cross" ? (
                  <>
                    <circle r={9} fill={theme.bg} />
                    <path d="M-5,-5L5,5M5,-5L-5,5" stroke={m.color} strokeWidth={2.5} strokeLinecap="round" />
                  </>
                ) : m.shape === "tick" ? (
                  <circle r={3} fill={m.color} stroke={theme.bg} strokeWidth={1.5} />
                ) : (
                  <circle r={5} fill={m.color} stroke={theme.bg} strokeWidth={2} />
                )}
                {m.label && !(narrow && m.legend) && (
                  <text x={10} y={4} fontSize={13} fill={theme.fg} {...halo}>
                    {m.label}
                  </text>
                )}
              </g>
            ))}

            {paths.map((p) =>
              p.end && p.s.endLabel ? (
                <text key={p.s.key} x={p.end[0] + 9} y={p.end[1] + 4} fontSize={12} fontWeight={600} fill={theme.fg}>
                  {p.s.endLabel}
                </text>
              ) : null,
            )}

            {gap && (() => {
              const gx = padL + plotW + 10, ya = inY(gap.from), yb = inY(gap.to);
              const stroke = { stroke: gap.color, strokeWidth: 2.25, strokeLinecap: "round" as const };
              return (
                <g pointerEvents="none">
                  <motion.line x1={gx} x2={gx} initial={false} animate={{ y1: ya, y2: yb }} transition={t(0.7)} {...stroke} />
                  <motion.line x1={gx - 4} x2={gx + 4} initial={false} animate={{ y1: ya, y2: ya }} transition={t(0.7)} {...stroke} />
                  <motion.line x1={gx - 4} x2={gx + 4} initial={false} animate={{ y1: yb, y2: yb }} transition={t(0.7)} {...stroke} />
                  <motion.g initial={false} animate={{ y: (ya + yb) / 2 }} transition={t(0.7)}>
                    <text x={gx + 10} y={gap.sub ? -2 : 4} fontSize={13} fontWeight={600} fill={theme.fg} className="tabular-nums">{gap.label}</text>
                    {gap.sub && <text x={gx + 10} y={13} fontSize={11.5} fill={theme.muted}>{gap.sub}</text>}
                  </motion.g>
                </g>
              );
            })()}

            {pulse && first?.end && (
              <g transform={`translate(${first.end[0]},${first.end[1]})`} pointerEvents="none">
                {!still && (
                  <motion.circle r={6} fill={first.s.color} animate={{ scale: [1, 2.6], opacity: [0.4, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                )}
                <circle r={6.5} fill={theme.bg} />
                <circle r={4} fill={first.s.color} />
              </g>
            )}

            {tracking && idx !== null && (
              <g pointerEvents="none">
                <line x1={X(xs[idx])} x2={X(xs[idx])} y1={padT - 4} y2={height} stroke={theme.fg} strokeOpacity={0.28} />
                {series.map((s) => {
                  const v = s.values[idx];
                  return v == null ? null : <circle key={s.key} cx={X(xs[idx])} cy={Y(Math.min(Math.max(v, y0), y1))} r={5} fill={s.color} stroke={theme.bg} strokeWidth={2.5} />;
                })}
              </g>
            )}
          </svg>
        )}

        <AnimatePresence>
          {tipData && idx !== null && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className={cn(
                "pointer-events-none absolute top-2 z-10 max-w-64 min-w-40 rounded-xl border px-3.5 py-2.5 text-[13.5px] shadow-xl",
                X(xs[idx]) > width * 0.6 ? "-translate-x-full" : "",
              )}
              style={{ left: X(xs[idx]) + (X(xs[idx]) > width * 0.6 ? -12 : 12), background: theme.tooltipBg, borderColor: theme.border, color: theme.fg }}
            >
              <p className="mb-1.5 text-[12.5px]" style={{ color: theme.muted }}>{tipData.title}</p>
              <div className="space-y-1">
                {tipData.rows.map((r) => (
                  <div key={r.label} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
                    <span style={{ color: theme.muted }}>{r.label}</span>
                    <span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
                  </div>
                ))}
              </div>
              {tipData.note && <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: theme.muted }}>{tipData.note}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {(showSeries || below.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] text-on-panel-2">
          {showSeries && series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <svg width="14" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="13" y2="4" stroke={s.color} strokeWidth="2.25" strokeLinecap="round" strokeDasharray={s.dashed ? "3 3" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
          {below.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5">
              <svg width="10" height="12" aria-hidden="true">
                {b.kind === "vline" ? <line x1="5" y1="1" x2="5" y2="11" stroke={b.color} strokeWidth="2" strokeLinecap="round" /> : <circle cx="5" cy="6" r="4" fill={b.color} />}
              </svg>
              {b.label}
            </span>
          ))}
        </div>
      )}

      {table && (
        <details className="mt-3 text-[13px] text-on-panel-faint">
          <summary className="cursor-pointer select-none hover:text-on-panel-2">Show as a table</summary>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-panel-line">
            <table className="w-full border-collapse text-left tabular-nums">
              <thead className="sticky top-0 bg-panel-2 text-on-panel-2">
                <tr>{table.head.map((h) => <th key={h} className="px-2.5 py-1.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-panel-line">
                    {row.map((c, j) => <td key={j} className="px-2.5 py-1">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
