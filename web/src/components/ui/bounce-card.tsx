// A feature card whose coloured panel bounces up when you point at it, after Bounce Card Features on 21st.dev.
// Written by hand with Motion. The card says one thing in its title; the panel shows it.
import { motion } from "motion/react";
import { useStill } from "@/lib/chart-kit";
import { cn } from "@/lib/utils";

/** The four panel colours, chosen so white text reads on each. */
export const BOUNCE = {
  violet: "linear-gradient(135deg, #8b6cff, #5b6cff)",
  orange: "linear-gradient(135deg, #ff9447, #f0591f)",
  green: "linear-gradient(135deg, #22c38e, #0b9a68)",
  pink: "linear-gradient(135deg, #ff6b93, #e5484d)",
} as const;

export function BounceCard({ title, color, children, className }: {
  title: string;
  color: keyof typeof BOUNCE;
  /** What the coloured panel shows. */
  children: React.ReactNode;
  className?: string;
}) {
  const still = useStill();
  return (
    <motion.div
      whileHover={still ? undefined : { scale: 0.97, rotate: -1 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      className={cn("group relative min-h-[360px] overflow-hidden rounded-[28px] border border-line bg-paper p-7 sm:p-8", className)}
    >
      <h3 className="display mx-auto max-w-[16ch] text-center text-[1.75rem] text-ink sm:text-[2rem]">{title}</h3>
      <div
        className="absolute bottom-0 left-4 right-4 top-[7.5rem] translate-y-6 rounded-t-3xl p-6 text-white transition-transform duration-300 ease-out group-hover:translate-y-2 group-hover:rotate-[1.5deg] sm:top-32"
        style={{ background: BOUNCE[color] }}
      >
        {children}
      </div>
    </motion.div>
  );
}
