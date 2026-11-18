// A dark card with a glow that follows the pointer, after the Spotlight Card on 21st.dev. Written by hand:
// the pointer's position goes into two CSS variables and a radial gradient reads them.
// On a touch screen there is no pointer, so a quieter glow always sits in one corner.
import { useRef } from "react";
import { cn } from "@/lib/utils";

export function SpotlightCard({ children, glow = "240 89 31", className }: {
  children: React.ReactNode;
  /** The glow's colour as "r g b". */
  glow?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={cn("group relative overflow-hidden rounded-[28px] border border-panel-line bg-panel p-7 text-on-panel sm:p-8", className)}
      style={{ "--glow": glow } as React.CSSProperties}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(340px circle at 88% -8%, rgb(var(--glow) / 0.22), transparent 62%)" }} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(460px circle at var(--sx, 50%) var(--sy, 0%), rgb(var(--glow) / 0.34), transparent 62%)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
