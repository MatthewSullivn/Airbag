// A hedge, quoted: the same market that prices the danger also sells protection against it.
// Read-only. Every number is either Gemini's live price to buy "No" on one of its bets, or follows from the loan
// and the lending market's own sell-off rule (src/hedge.mjs, shared with the server and the tests).
// Airbag never places this bet, and the page says what the quote leaves out.
import { hedgeQuote } from "@hedge";
import type { Ladders, Reading } from "@/lib/api";
import { dayET, usd } from "@/lib/format";
import { Card } from "./bits";

const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HedgeCard({ ladders, reading, lltv }: { ladders: Ladders | null; reading: Reading | null; lltv: number }) {
  if (!ladders || !reading) return null;
  const event = ladders.events.find((e) => e.ticker === reading.odds?.ticker) ?? ladders.events[0];
  const q = event ? hedgeQuote({ bets: event.bets, line: reading.line, debt: reading.loan.debt, lltv }) : null;
  if (!event || !q) return null;
  const penalty = `${(q.penaltyShare * 100).toFixed(1)}%`;
  // the same quote for a loan of a size people recognise (testnet loans are a few dollars)
  const big = hedgeQuote({ bets: event.bets, line: reading.line, debt: 50_000, lltv });

  return (
    <Card>
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">Want insurance as well? The same market sells it.</h2>
      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[1.15rem] text-ink-2">
        <span className="figure text-[3.4rem] text-ink">{money(q.price)}</span> buys
        <span className="figure text-[3.4rem] text-ink">$1.00</span>
        if bitcoin ends below {usd(q.strike)} on {dayET(event.expiryDate)}.
      </p>
      <p className="mt-4 max-w-[62ch] text-[1.05rem] leading-relaxed text-ink-2">
        For this loan: being sold off would cost about <strong className="font-semibold text-ink">{money(q.loss)}</strong>. Covering that costs about{" "}
        <strong className="font-semibold text-ink">{money(q.cost)}</strong> today.
        {big && <> On a $50,000 loan: about <strong className="font-semibold text-ink">{usd(big.loss)}</strong>, covered for about <strong className="font-semibold text-ink">{usd(big.cost)}</strong>.</>}
      </p>
      <details className="mt-5 border-t border-line pt-4 text-[15px] text-ink-2">
        <summary className="cursor-pointer select-none font-semibold text-ink">How this is worked out, and what it leaves out</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>{money(q.price)} is what it costs right now to buy "No" on Gemini's bet "{usd(q.strike)} or above". A "No" pays $1 if bitcoin ends below that price. Read live.</li>
          <li>It pays on the end date only. A dip that takes the loan and then recovers pays nothing. That gap is what Airbag itself is for.</li>
          {q.strike > reading.line + 1 && <li>{usd(q.strike)} is the lowest bet at or above your price of {usd(reading.line)}. So it also pays in some cases where the loan survived.</li>}
          <li>A sell-off takes {penalty} more bitcoin than the debt is worth. That is the lending market's rule (Morpho, for loans up to {Math.round(lltv * 100)}%). {penalty} of {reading.loan.debt.toFixed(2)} USDC is {money(q.loss)}.</li>
          <li>Gemini's own fees are not included.</li>
          <li>This is a quote. Airbag does not place the bet.</li>
        </ul>
      </details>
    </Card>
  );
}
