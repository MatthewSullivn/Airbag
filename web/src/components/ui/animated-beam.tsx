// Animated Beam from Magic UI (https://magicui.design, MIT, on 21st.dev as @dillionverma), pulled from its public
// registry on Nov 18, 2026: a pulse of light that travels along a line between two elements.
// Airbag: the original draws from centre to centre and sweeps the light across the whole container, which suits
// long curved lines. Our lines are short straight wires between neighbouring boxes, so here the line runs from
// the facing edge of one box to the facing edge of the other, and the light travels exactly that stretch.
// Also: no animation when motion is switched off, and the line is measured again when the window resizes.
import { useEffect, useId, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { useStill } from "@/lib/chart-kit";
import { cn } from "@/lib/utils";

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  /** The light travels from `to` back to `from`. */
  reverse?: boolean;
  /** The two boxes sit one above the other (default: side by side). */
  vertical?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  /** Seconds before the first pulse. */
  delay?: number;
  /** Seconds one pulse takes to cross. */
  duration?: number;
  repeat?: number;
  /** Seconds of rest between pulses. */
  repeatDelay?: number;
}

interface Line { x1: number; y1: number; x2: number; y2: number }

export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  reverse = false,
  vertical = false,
  duration = 1.4,
  delay = 0,
  pathColor = "gray",
  pathWidth = 2,
  pathOpacity = 0.2,
  gradientStartColor = "#ffaa40",
  gradientStopColor = "#9c40ff",
  repeat = Infinity,
  repeatDelay = 0,
}: AnimatedBeamProps) {
  const id = useId();
  const still = useStill();
  const [line, setLine] = useState<Line | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const measure = () => {
      const c = containerRef.current, a = fromRef.current, b = toRef.current;
      if (!c || !a || !b) return;
      const cr = c.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (!cr.width || !ra.width || !rb.width) return setLine(null);          // hidden (the phone layout shows instead)
      setSize({ width: cr.width, height: cr.height });
      if (vertical) {
        const x = ra.left + ra.width / 2 - cr.left;
        const down = rb.top >= ra.bottom;
        setLine({ x1: x, x2: x, y1: (down ? ra.bottom : ra.top) - cr.top, y2: (down ? rb.top : rb.bottom) - cr.top });
      } else {
        // level with the middle of the stretch the two boxes share
        const y = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2 - cr.top;
        const right = rb.left >= ra.right;
        setLine({ y1: y, y2: y, x1: (right ? ra.right : ra.left) - cr.left, x2: (right ? rb.left : rb.right) - cr.left });
      }
    };
    const observer = new ResizeObserver(measure);
    for (const el of [containerRef.current, fromRef.current, toRef.current]) if (el) observer.observe(el);
    addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, [containerRef, fromRef, toRef, vertical]);

  if (!line) return null;
  const d = `M ${line.x1},${line.y1} L ${line.x2},${line.y2}`;
  // the pulse: a head that travels from one end to the other, with a fading tail half the line long behind it
  const [s, e] = reverse ? (vertical ? [line.y2, line.y1] : [line.x2, line.x1]) : vertical ? [line.y1, line.y2] : [line.x1, line.x2];
  const dir = Math.sign(e - s) || 1;
  const tail = Math.abs(e - s) * 0.55;
  const head = [s, e + tail * dir], back = [s - tail * dir, e];
  const fixed = vertical ? [line.x1, line.x1] : [line.y1, line.y1];
  const sweep = vertical ? { x1: fixed, x2: fixed, y1: head, y2: back } : { x1: head, x2: back, y1: fixed, y2: fixed };
  const start = vertical ? { x1: fixed[0], x2: fixed[0], y1: head[0], y2: back[0] } : { x1: head[0], x2: back[0], y1: fixed[0], y2: fixed[0] };

  return (
    <svg
      fill="none"
      width={size.width}
      height={size.height}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("pointer-events-none absolute left-0 top-0 transform-gpu", className)}
      viewBox={`0 0 ${size.width} ${size.height}`}
    >
      <path d={d} stroke={pathColor} strokeWidth={pathWidth} strokeOpacity={pathOpacity} strokeLinecap="round" />
      {!still && <path d={d} strokeWidth={pathWidth + 1} stroke={`url(#${id})`} strokeLinecap="round" />}
      {!still && (
        <defs>
          <motion.linearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            initial={start}
            animate={sweep}
            transition={{ delay, duration, ease: "linear", repeat, repeatDelay }}
          >
            <stop stopColor={gradientStartColor} stopOpacity="0" />
            <stop offset="8%" stopColor={gradientStartColor} />
            <stop offset="40%" stopColor={gradientStopColor} />
            <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
          </motion.linearGradient>
        </defs>
      )}
    </svg>
  );
}
