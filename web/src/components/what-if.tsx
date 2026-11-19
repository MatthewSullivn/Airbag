// "What if?" for a real loan nobody may push from the page: borrow more on paper, pick your own limit, and see
// what Airbag would do. Two sliders and one answer.
// Nothing here touches the loan or the bot. The answer is worked out on the page, with the bot's own rule
// (decide() in src/brain.mjs) on the loan's real numbers and Gemini's live prices, so it is what the bot
// itself would decide if the loan really stood there.
import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { decide, liqPrice, makeOddsModel } from "@brain";
import type { Ladders, Reading, Status } from "@/lib/api";
import { useLiveEvents, type GeminiFeed } from "@/lib/gemini-feed";
import { pct, usd, usdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, StatusPill } from "./bits";
import { MetalButton, ShinyButton } from "./ui/cta";

// the demo's real "Push it to the edge" borrows up to this health, at bitcoin's real price
const EDGE_HEALTH = 1.06;
// the slider stops just short of bitcoin's price itself
const LAST_HEALTH = 1.02;
const LIMITS = { min: 0.01, max: 0.2, step: 0.005 };

export function WhatIf({ id, status, reading, ladders, feed, className }: {
  id?: string;
  status: Status;
  reading: Reading | null;
  ladders: Ladders | null;
  feed: GeminiFeed;
  className?: string;
}) {
  const events = useLiveEvents(ladders, feed);
  const oddsAt = useMemo(() => (events.length ? makeOddsModel(events.map((e) => ({ ticker: e.ticker, ladder: e.live }))).oddsAt : null), [events]);
  // how much more the loan borrows on paper, as a share of the way to the last stop (so it keeps its place while prices move)
  const [push, setPush] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);

  const r = reading;
  if (!r || !oddsAt || !(r.loan.debt > 0) || !(r.loan.collateral > 0)) return null;
  const lltv = status.lltv, price = r.priceUsed, { debt, collateral } = r.loan;
  const myLimit = limit ?? status.limit;
  const worth = collateral * price * lltv;                       // the debt at which the bitcoin is lost right now
  const maxExtra = Math.max(0, worth / LAST_HEALTH - debt);
  const edge = maxExtra > 0 ? Math.min(1, Math.max(0, worth / EDGE_HEALTH - debt) / maxExtra) : 0;
  const extra = maxExtra * push;
  const paperDebt = debt + extra;
  const line = liqPrice(paperDebt, collateral, lltv);
  const savings = r.savings?.balance ?? 0;
  const d = decide({ debt: paperDebt, collateral, btcPrice: price, lltv }, null, savings, r.inLoan, myLimit, { oddsAt });
  const over = d.odds != null && d.odds > myLimit;
  const acts = d.action === "repay" || d.action === "out_of_savings";
  const after = d.action === "repay" ? liqPrice(paperDebt - d.repay, collateral, lltv) : null;
  const untouched = push === 0 && limit == null;

  const SLIDER = "h-2 w-full cursor-pointer accent-brand";
  return (
    <Card id={id} className={cn("scroll-mt-28", className)} aria-label="What if? Try a push on paper">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">What if? Push this loan on paper.</h2>
        <p className="text-[14.5px] text-faint">The real loan is not touched. Same rule as the bot, on Gemini's live prices.</p>
      </div>

      <div className="mt-6 grid gap-x-12 gap-y-7 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-7">
          <div>
            <label htmlFor="whatif-push" className="flex flex-wrap items-baseline justify-between gap-x-4 text-[15px] text-ink-2">
              <span>If it borrowed more</span>
              <span className="font-semibold text-ink">+${usdc(extra)} <span className="font-normal text-ink-2">· lost below {usd(line)}</span></span>
            </label>
            <input
              id="whatif-push"
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={push}
              onChange={(e) => setPush(Number(e.target.value))}
              aria-valuetext={`borrow ${usdc(extra)} USDC more: the bitcoin would be lost below ${usd(line)}`}
              className={cn(SLIDER, "mt-3")}
            />
            <div className="mt-1.5 flex justify-between text-[12.5px] text-faint"><span>as it is</span><span>right at bitcoin's price ({usd(price)})</span></div>
          </div>
          <div>
            <label htmlFor="whatif-limit" className="flex flex-wrap items-baseline justify-between gap-x-4 text-[15px] text-ink-2">
              <span>If your limit were</span>
              <span className="font-semibold text-ink">{pct(myLimit)}{limit == null || Math.abs(myLimit - status.limit) < 1e-9 ? <span className="font-normal text-ink-2"> · what Airbag uses now</span> : null}</span>
            </label>
            <input
              id="whatif-limit"
              type="range"
              min={LIMITS.min}
              max={LIMITS.max}
              step={LIMITS.step}
              value={myLimit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-valuetext={`a limit of ${pct(myLimit)}`}
              className={cn(SLIDER, "mt-3")}
            />
            <div className="mt-1.5 flex justify-between text-[12.5px] text-faint"><span>careful: steps in early</span><span>relaxed: steps in late</span></div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <ShinyButton small onClick={() => setPush(edge)} disabled={Math.abs(push - edge) < 1e-6}>Push it to the edge</ShinyButton>
            <MetalButton small onClick={() => { setPush(0); setLimit(null); }} disabled={untouched}><RotateCcw aria-hidden="true" className="size-4" /> Back to the real loan</MetalButton>
          </div>
        </div>

        {/* the answer */}
        <div className="flex flex-col rounded-2xl border border-line bg-page/60 p-5 sm:p-6" role="status" aria-live="polite">
          <p className="text-[15px] text-ink-2">Chance of losing the bitcoin{untouched ? ", as it is" : ", on paper"}</p>
          <p className={cn("figure mt-2 text-[4.6rem]", over ? "text-critical" : "text-ink")}>{d.odds == null ? "–" : pct(d.odds)}</p>
          <div className="mt-3">
            {acts
              ? <StatusPill tone="critical" small>{over ? `Over ${pct(myLimit)}. Airbag would step in.` : "Too close. Airbag would step in."}</StatusPill>
              : <StatusPill tone="good" small>Under {pct(myLimit)}. Airbag would wait.</StatusPill>}
          </div>
          <p className="mt-3.5 text-[1.02rem] leading-snug text-ink-2">
            {d.action === "repay" && after != null ? (
              <>It would pay down <strong className="font-semibold text-ink">${usdc(d.repay)}</strong> of the loan from the savings. The bitcoin would then be safe down to <strong className="font-semibold text-ink">{usd(after)}</strong>.</>
            ) : d.action === "out_of_savings" ? (
              <>It would want to pay the loan down, but the savings are empty.</>
            ) : d.action === "give_back" ? (
              <>It is calm, so it would put <strong className="font-semibold text-ink">${usdc(d.borrow)}</strong> back into the savings.</>
            ) : (
              <>Bitcoin could fall <strong className="font-semibold text-ink">{usd(Math.max(0, price - line))}</strong> before the bitcoin is lost.</>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
