// A small line with a halftone fill and no axes: "how has this number moved". The look of tweenly's KPI sparkline.
import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { linePath, useStill, type Point } from "@/lib/chart-kit";

export function Spark({ values, color, height = 72, floor, ceiling, mark, label }: {
  values: number[];
  color: string;
  height?: number;
  /** Lowest and highest value the scale should cover, so a flat line does not look like a cliff. */
  floor?: number;
  ceiling?: number;
  /** A dashed level to compare against (the limit), drawn only when it fits the scale. */
  mark?: { y: number; color: string };
  label: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduced = useStill();
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  const n = values.length;
  let lo = Math.min(...values, floor ?? Infinity), hi = Math.max(...values, ceiling ?? -Infinity);
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi) || hi === lo) hi = lo + 1;
  const top = 6, pad = 5;
  const x = (i: number) => (n > 1 ? pad + (i / (n - 1)) * (w - pad * 2) : w / 2);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (height - top - 3);
  const pts: Point[] = values.map((v, i) => [x(i), y(v)]);
  const line = n ? linePath(pts, "linear") : "";
  const area = n > 1 ? `${line}L${pts[n - 1][0]},${height}L${pts[0][0]},${height}Z` : "";

  return (
    <div ref={setNode} role="img" aria-label={label} className="relative w-full" style={{ height }}>
      {w > 0 && n > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          <defs>
            <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="1.25" cy="1.25" r="1.05" fill={color} />
              <circle cx="3.75" cy="3.75" r="1.05" fill={color} />
            </pattern>
            <clipPath id={`${id}-reveal`}>
              <motion.rect x={-8} y={-8} height={height + 16} initial={reduced ? false : { width: 0 }} animate={{ width: w + 16 }} transition={reduced ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
            </clipPath>
          </defs>
          {mark && mark.y <= hi && mark.y >= lo && <line x1={0} x2={w} y1={y(mark.y)} y2={y(mark.y)} stroke={mark.color} strokeWidth={1.25} strokeDasharray="4 4" />}
          <g clipPath={`url(#${id}-reveal)`}>
            {area && (
              <g opacity={0.6}>
                <path d={area} fill={color} opacity={0.1} />
                <path d={area} fill={`url(#${id}-dots)`} opacity={0.8} />
              </g>
            )}
            <path d={line} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g transform={`translate(${pts[n - 1][0]},${pts[n - 1][1]})`}>
            {!reduced && <motion.circle r={5} fill={color} animate={{ scale: [1, 2.6], opacity: [0.4, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />}
            <circle r={6} fill="#161616" />
            <circle r={3.75} fill={color} />
          </g>
        </svg>
      )}
    </div>
  );
}
