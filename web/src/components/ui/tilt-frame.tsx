// A framed screen that starts tilted back and lies flat as you scroll down to it: the effect of the Container
// Scroll Animation on 21st.dev. Written here with Motion; no code from that component is used.
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useStill } from "@/lib/chart-kit";
import { cn } from "@/lib/utils";

export function TiltFrame({ children, className, flat }: { children: React.ReactNode; className?: string; /** Airbag: no tilt, just the frame. */ flat?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useStill();
  // 0 while the frame's top is low on the screen, 1 once it has come up near the top
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "start 20%"] });
  const tilt = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const size = useTransform(scrollYProgress, [0, 1], [0.95, 1]);

  return (
    <div ref={ref} className={cn("mx-auto w-full max-w-[1120px]", className)} style={{ perspective: 1200 }}>
      <motion.div
        // flat and full size when motion is switched off
        style={still || flat ? undefined : { rotateX: tilt, scale: size, transformOrigin: "50% 100%" }}
        className="rounded-[30px] border-4 border-[#5a5a57] bg-[#1c1c1b] p-2 shadow-[0_9px_20px_rgb(0_0_0/0.29),0_37px_37px_rgb(0_0_0/0.26),0_84px_50px_rgb(0_0_0/0.15)] sm:p-4"
      >
        <div className="overflow-hidden rounded-[20px] bg-page p-3 sm:p-5">{children}</div>
      </motion.div>
    </div>
  );
}
