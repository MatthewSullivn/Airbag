// Dot Pattern from Magic UI (https://magicui.design, MIT, on 21st.dev as @dillionverma), pulled from its public
// registry on Nov 18, 2026: a field of dots that fills its container. The dots take the text colour.
// Airbag: drawn as one repeating SVG pattern instead of one circle per dot (a few nodes instead of thousands),
// and without the glow animation. It sits still, behind the one thing that moves.
import { useId } from "react";
import { cn } from "@/lib/utils";

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  /** Horizontal spacing between dots. */
  width?: number;
  /** Vertical spacing between dots. */
  height?: number;
  cx?: number;
  cy?: number;
  /** The radius of each dot. */
  cr?: number;
  className?: string;
}

export function DotPattern({ width = 16, height = 16, cx = 1, cy = 1, cr = 1, className, ...props }: DotPatternProps) {
  const id = useId();
  return (
    <svg aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full text-neutral-400/80", className)} {...props}>
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
          <circle cx={cx} cy={cy} r={cr} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
