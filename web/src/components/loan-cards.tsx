// A loan's two cards, side by side: the chance of losing the bitcoin, and the room bitcoin has to fall.
// Both show the same moment (lib/loan-view), so when a loan is at risk the number and the picture agree.
import { useEffect, useMemo, useState } from "react";
import type { LogEntry, Reading, Sample, Status } from "@/lib/api";
import { useLoanView } from "@/lib/loan-view";
import { cn } from "@/lib/utils";
import { NumberCard, recentMove } from "./number-card";
import { PriceCard } from "./price-card";

const HOUR = 3_600_000;

export function LoanCards({ status, reading, samples, actions, pending, footer, split = "lg" }: {
  status: Status;
  reading: Reading | null;
  samples: Sample[];
  /** What Airbag did for this loan, newest first. */
  actions: LogEntry[];
  /** Something was just pressed and the chain has not answered yet, e.g. "Pushing the loan…" */
  pending?: string | null;
  /** One link or line under the number's chart. */
  footer?: React.ReactNode;
  /** From which width the two cards sit side by side. */
  split?: "md" | "lg";
}) {
  const view = useLoanView(status, reading, actions);

  // The dangers this page saw the bot read. The bot only keeps a sample every 15 s, so without these a danger
  // that lasted three seconds would leave no mark on the chart of the last hour.
  const [seen, setSeen] = useState<Sample[]>([]);
  const mark = view.mark, health = reading?.health ?? null, btc = reading?.priceUsed ?? null;
  const markT = mark?.t ?? null, markOdds = mark?.odds ?? null, markLine = mark?.line ?? null;
  useEffect(() => {
    if (markT == null) return;
    setSeen((prev) =>
      prev.some((p) => Math.abs(p.t - markT) < 1000)
        ? prev
        : [...prev.filter((p) => markT - p.t < HOUR).slice(-60), { t: markT, odds: markOdds, source: null, line: markLine, health, btc }],
    );
  }, [markT, markOdds, markLine, health, btc]);
  const lastHour = useMemo(() => (seen.length ? [...samples, ...seen].sort((a, b) => a.t - b.t) : samples), [samples, seen]);

  return (
    <div className={cn("grid gap-3", split === "md" ? "md:grid-cols-2" : "lg:grid-cols-2")}>
      <NumberCard status={status} reading={reading} samples={lastHour} view={view} pending={pending} justNow={recentMove(actions, status.now)} footer={footer} />
      <PriceCard status={status} reading={reading} samples={samples} view={view} />
    </div>
  );
}
