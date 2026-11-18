// Gemini's own market, the way it looks on gemini.com: the question, bitcoin's price now, a few of the bets
// nearest that price with what the market gives each, and the money traded. Every figure is live from Gemini
// (/api/ladders). This is the raw material Airbag reads. The card is ours, not Gemini's: it says so and links out.
import { ArrowUpRight, Bitcoin } from "lucide-react";
import type { LadderEvent } from "@/lib/api";
import { dayET, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GeminiMarketCard({ event, spot, className }: { event: LadderEvent | undefined; spot: number | null; className?: string }) {
  if (!event || event.ladder.length < 2) {
    return <div className={cn("grid min-h-[19rem] place-items-center rounded-3xl border border-black/10 bg-white p-6 text-[15px] text-black/50", className)}>Reading Gemini's market…</div>;
  }
  const ladder = [...event.ladder].sort((a, b) => a.strike - b.strike);
  // the three bets nearest bitcoin's price, low to high: that is where the trading is
  const centre = spot ?? ladder[Math.floor(ladder.length / 2)].strike;
  const near = [...ladder].sort((a, b) => Math.abs(a.strike - centre) - Math.abs(b.strike - centre)).slice(0, 3).sort((a, b) => a.strike - b.strike);
  const yesPrice = (strike: number, mid: number) => event.bets?.find((b) => b.strike === strike)?.buyYes ?? mid;

  return (
    <div className={cn("rounded-3xl border border-black/10 bg-white p-5 text-[#0b0b0b] shadow-[0_24px_50px_-28px_rgb(0_0_0/0.45)] sm:p-6", className)}>
      <div className="flex items-center gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#f7931a] text-white" aria-hidden="true"><Bitcoin className="size-7" strokeWidth={2.4} /></span>
        <div className="min-w-0">
          <p className="text-[1.15rem] font-semibold leading-tight tracking-tight">Bitcoin price on {dayET(event.expiryDate)}?</p>
          <p className="mt-0.5 text-[14px] text-black/55">Current: <span className="font-semibold text-[#c2570a]">{usd(spot)}</span></p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {near.map((p) => {
          const yes = yesPrice(p.strike, p.pAbove);
          return (
            <li key={p.strike} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-[1.02rem] font-semibold">{usd(p.strike)} or above</span>
              {yes > 0 && yes < 1 && <span className="text-[13.5px] font-semibold text-[#1a9f53]">{(1 / yes).toFixed(1)}x</span>}
              <span className="grid h-10 w-[4.6rem] place-items-center rounded-full border-[1.5px] border-[#1e7bd8] text-[1.02rem] font-semibold">{Math.round(p.pAbove * 100)}%</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13.5px] text-black/55">
        <span className="rounded-full border border-black/12 px-2.5 py-1">+ {ladder.length - near.length} more bets</span>
        {event.volume != null && <span>{usd(event.volume)} vol.</span>}
      </div>
      <p className="mt-4 border-t border-black/10 pt-3.5 text-[13.5px] text-black/60">
        Live from Gemini's prediction market.{" "}
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 font-semibold text-[#0b0b0b] underline decoration-black/30 underline-offset-[3px] hover:decoration-black">
            Open it on Gemini<ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </p>
    </div>
  );
}
