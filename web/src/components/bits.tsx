// Small pieces every screen uses: the dark instrument panel, the light card, pills, buttons, explorer links, counting numbers.
import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { useStill } from "@/lib/chart-kit";
import { ArrowUpRight, Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { short, type Tone } from "@/lib/format";
import { BorderBeam } from "./ui/border-beam";
import { FadeIn } from "./ui/fade-in";

/** A dark instrument panel: where a live number or a chart sits. The same surface in the light and the dark theme. */
export function Panel({ className, children, tone, beam, ...rest }: React.HTMLAttributes<HTMLElement> & { tone?: "critical" | null; /** A slow, quiet beam round the border: "this is live". */ beam?: boolean }) {
  return (
    <section
      {...rest}
      className={cn(
        "relative flex min-w-0 flex-col rounded-[32px] border bg-panel p-6 text-on-panel shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_30px_60px_-30px_rgb(0_0_0/0.45)] transition-colors duration-500 sm:p-8",
        tone === "critical" ? "border-critical/80" : "border-panel-line",
        className,
      )}
    >
      {children}
      {tone === "critical" ? (
        <BorderBeam size={140} duration={3.5} borderWidth={2} colorFrom="#ff8a7d" colorTo="#d03b3b" />
      ) : beam ? (
        <BorderBeam size={110} duration={9} borderWidth={1.5} colorFrom="#ffb48a" colorTo="#f0591f" />
      ) : null}
    </section>
  );
}

/** A plain light card for words and simple facts. */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("min-w-0 rounded-[28px] border border-line bg-paper p-6 sm:p-7", className)}>
      {children}
    </div>
  );
}

const TONE: Record<Tone, string> = {
  good: "bg-good text-white",
  warning: "bg-warning text-[#0b0b0b]",
  serious: "bg-serious text-[#0b0b0b]",
  critical: "bg-critical text-white",
  neutral: "bg-panel-3 text-on-panel-2",
};
/** A status always comes as an icon and words, never as a colour alone. */
export function StatusPill({ tone, children, small }: { tone: Tone; children: React.ReactNode; small?: boolean }) {
  const Icon = tone === "good" ? Check : tone === "neutral" ? null : TriangleAlert;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold", small ? "px-2.5 py-0.5 text-[13px]" : "px-3.5 py-1.5 text-[15px]", TONE[tone])}>
      {Icon && <Icon aria-hidden="true" className={small ? "size-3.5" : "size-4"} strokeWidth={3} />}
      {children}
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "brand" | "ink" | "panel" | "ghost" | "danger" | "outline"; size?: "sm" | "md" | "lg" };
const buttonClass = ({ variant = "panel", size = "md", className }: Pick<ButtonProps, "variant" | "size" | "className">) =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold no-underline transition-[transform,background-color,opacity,filter] duration-150 active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100",
    size === "sm" && "px-4 py-2 text-[14px]",
    size === "md" && "px-5 py-2.5 text-[15px]",
    size === "lg" && "px-7 py-3.5 text-[17px]",
    variant === "brand" && "bg-brand text-brand-ink hover:brightness-110",
    variant === "ink" && "bg-ink text-page hover:opacity-90",
    variant === "panel" && "bg-panel-3 text-on-panel hover:bg-[#3a3a37]",
    variant === "ghost" && "text-on-panel-2 hover:bg-panel-2 hover:text-on-panel",
    variant === "danger" && "bg-critical text-white hover:brightness-110",
    variant === "outline" && "border border-ink/20 text-ink hover:bg-ink/5",
    className,
  );
export function Button({ variant, size, className, ...rest }: ButtonProps) {
  return <button type="button" {...rest} className={buttonClass({ variant, size, className })} />;
}

/** A link out to Arc's block explorer. `kind` picks /address or /tx. */
export function ExplorerLink({ explorer, kind, id, children, className }: { explorer: string | null; kind: "address" | "tx"; id: string; children?: React.ReactNode; className?: string }) {
  const text = children ?? short(id);
  if (!explorer) return <span className={cn("mono", className)}>{text}</span>;
  return (
    <a href={`${explorer}/${kind}/${id}`} target="_blank" rel="noopener" className={cn("inline-flex items-center gap-0.5 underline decoration-current/30 underline-offset-[3px] hover:decoration-current", className)}>
      <span className={children ? undefined : "mono"}>{text}</span>
      <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
    </a>
  );
}

/** A number that glides to its new value instead of jumping. Proportional digits, as big figures should have. */
export function Count({ value, format, className }: { value: number | null | undefined; format: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shownValue = useRef<number | null>(null);
  const reduced = useStill();   // reduced motion, or ?still in the address
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null || !Number.isFinite(value)) {
      el.textContent = "–";
      shownValue.current = null;
      return;
    }
    const from = shownValue.current;
    if (from == null || reduced) {
      el.textContent = format(value);
      shownValue.current = value;
      return;
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shownValue.current = v;
        el.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, format, reduced]);
  return <span ref={ref} className={className}>{value == null ? "–" : format(value)}</span>;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-[22px] font-semibold leading-none tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="var(--brand)" />
        <path d="M8.5 19.5c2.2-6.6 12.8-6.6 15 0" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </svg>
      Airbag
    </span>
  );
}

/** A page section on the landing page: one big line, a sentence or two, and one thing to look at. */
export function Section({ id, eyebrow, step, title, lead, children, className }: { id?: string; eyebrow?: string; /** A step number, e.g. "1", shown big and quiet beside the heading. */ step?: string; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-14 sm:py-20", className)}>
      {/* the words glide up as the section comes into view, then the picture a moment later */}
      <FadeIn distance={18} duration={0.7} amount={0.3}>
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        {step && <p className="figure mb-3 text-[3.2rem] text-brand" aria-hidden="true">{step}</p>}
        <h2 className="display max-w-[20ch] text-[clamp(2.2rem,5.2vw,3.9rem)] text-ink">{title}</h2>
        {lead && <p className="mt-5 max-w-[46ch] text-[1.15rem] leading-relaxed text-ink-2">{lead}</p>}
      </FadeIn>
      {children && <FadeIn distance={24} duration={0.8} delay={0.1} amount={0.06} className="mt-10 sm:mt-12">{children}</FadeIn>}
    </section>
  );
}
