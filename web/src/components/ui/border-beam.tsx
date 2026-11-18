// Border Beam from Magic UI (https://magicui.design, MIT, on 21st.dev as @dillionverma), pulled from its public
// registry on Nov 18, 2026: a beam of light that travels along the border of its container.
// The container must be `relative` and have a border radius. Airbag: nothing is drawn when motion is switched off.
import { motion, type MotionStyle, type Transition } from "motion/react";
import { useStill } from "@/lib/chart-kit";
import { cn } from "@/lib/utils";

interface BorderBeamProps {
  /** The size of the border beam. */
  size?: number;
  /** Seconds for one trip around the border. */
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  transition?: Transition;
  className?: string;
  style?: React.CSSProperties;
  reverse?: boolean;
  /** The initial offset position (0-100). */
  initialOffset?: number;
  borderWidth?: number;
}

export function BorderBeam({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) {
  const still = useStill();
  if (still) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={{ "--border-beam-width": `${borderWidth}px` } as React.CSSProperties}
    >
      <motion.div
        className={cn("absolute aspect-square", "bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent", className)}
        style={{ width: size, offsetPath: `rect(0 auto auto 0 round ${size}px)`, "--color-from": colorFrom, "--color-to": colorTo, ...style } as MotionStyle}
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{ offsetDistance: reverse ? [`${100 - initialOffset}%`, `${-initialOffset}%`] : [`${initialOffset}%`, `${100 + initialOffset}%`] }}
        transition={{ repeat: Infinity, ease: "linear", duration, delay: -delay, ...transition }}
      />
    </div>
  );
}
