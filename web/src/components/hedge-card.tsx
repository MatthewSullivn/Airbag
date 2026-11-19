// A hedge, as an order ticket: the same market that prices the danger also sells protection against it.
// The ticket says which of Gemini's bets covers this loan, how many contracts, what they cost at the live price
// and what they pay. Every number is either Gemini's price to buy "No" on one of its bets (from its live feed,
// or the server's last read), or follows from the loan and the lending market's own sell-off rule
// (src/hedge.mjs, shared with the server and the tests).
// On the real site this is a quote: Gemini's prediction markets are real money, so the page shows the exact order
// and links to the bet. When the server has a key for Gemini's TEST site, the bot places this order there for
// real each time it saves a loan (src/hedger.ts), and the card shows the last one.
import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { hedgeOrder, hedgeQuote } from "@hedge";
import { buyNoOf } from "@live";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MetalButton, MetalLink } from "@/components/ui/cta";
import type { Ladders, Reading, Status } from "@/lib/api";
import type { GeminiFeed } from "@/lib/gemini-feed";
import { clock, dayET, usd } from "@/lib/format";
import { Card } from "./bits";
import { cents, LiveBadge, Tick } from "./live-odds";

const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SIZES = [
  { value: "own", label: "This loan" },
  { value: "10000", label: "$10,000" },
  { value: "100000", label: "$100,000" },
];

export function HedgeCard({ ladders, reading, lltv, feed, hedge }: { ladders: Ladders | null; reading: Reading | null; lltv: number; feed?: GeminiFeed; /** Orders the bot placed on Gemini's test site, when it has a key for it. */ hedge?: Status["hedge"] }) {
  // testnet loans are a few dollars, so the ticket opens on a loan of a size people recognise
  const [size, setSize] = useState("100000");
  const [copied, setCopied] = useState(false);
  if (!ladders || !reading) return null;
  const event = ladders.events.find((e) => e.ticker === reading.odds?.ticker) ?? ladders.events[0];
  if (!event) return null;
  // the live price of a "No" wherever the feed has one: a "No" is bought from whoever bids for "Yes"
  const quotes = feed?.state === "live" ? feed.quotes : null;
  const bets = (event.bets ?? []).map((b) => ({ ...b, buyNo: (b.symbol && quotes ? buyNoOf(quotes[b.symbol.toUpperCase()]) : null) ?? b.buyNo }));
  const debt = size === "own" ? reading.loan.debt : Number(size);
  const q = hedgeQuote({ bets, line: reading.line, debt, lltv });
  if (!q) return null;

  const penalty = `${(q.penaltyShare * 100).toFixed(1)}%`;
  const date = dayET(event.expiryDate);
  // one "No" pays one dollar, so covering the loss takes that many contracts, rounded up to a whole one.
  // hedgeOrder() is the same function the bot uses when it places the order on Gemini's test site.
  const order = hedgeOrder(q);
  const contracts = order ? Number(order.quantity) : Math.max(1, Math.ceil(q.loss - 1e-9));
  const cost = contracts * q.price;
  const placed = hedge?.enabled ? hedge.last : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Buy ${contracts.toLocaleString("en-US")} No on "${usd(q.strike)} or above" (${q.symbol ?? ""}), limit ${cents(q.price)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* no clipboard here: the order is on the screen */ }
  };

  const ROW = "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 border-t border-line py-3 first:border-t-0";
  const KEY = "text-[15px] text-ink-2";
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">Want insurance as well? The same market sells it.</h2>
          <p className="mt-1.5 max-w-[56ch] text-[1.02rem] leading-snug text-ink-2">The hedge for a loan, written as the order you would place on Gemini. The price is live.</p>
        </div>
        <SegmentedControl aria-label="Loan size" size="sm" value={size} onValueChange={setSize} options={SIZES} className="border-line bg-ink/5" pillColor="var(--paper)" />
      </div>

      <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* the ticket */}
        <dl className="rounded-2xl border border-line bg-page/60 px-5 py-2">
          <div className={ROW}>
            <dt className={KEY}>Buy</dt>
            <dd className="text-right font-semibold text-ink">No on "Bitcoin {usd(q.strike)} or above on {date}"</dd>
          </div>
          <div className={ROW}>
            <dt className={KEY}>Contracts</dt>
            <dd className="text-right font-semibold text-ink">{contracts.toLocaleString("en-US")} <span className="font-normal text-ink-2">· each pays $1.00</span></dd>
          </div>
          <div className={ROW}>
            <dt className={KEY}>Price now</dt>
            <dd className="text-right font-semibold text-ink"><Tick value={cents(q.price)} className="px-1">{cents(q.price)}</Tick> <span className="font-normal text-ink-2">each</span></dd>
          </div>
          <div className={ROW}>
            <dt className={KEY}>You pay</dt>
            <dd className="figure text-[2.3rem] text-ink"><Tick value={money(cost)} className="px-1">{money(cost)}</Tick></dd>
          </div>
          <div className={ROW}>
            <dt className={KEY}>It pays</dt>
            <dd className="text-right"><span className="figure text-[2.3rem] text-ink">{usd(contracts)}</span><span className="block text-[14px] text-ink-2">if bitcoin ends below {usd(q.strike)} on {date}</span></dd>
          </div>
        </dl>

        {/* what it is for, and the way out to Gemini */}
        <div className="flex min-w-0 flex-col">
          <p className="text-[1.05rem] leading-relaxed text-ink-2">
            {size === "own" ? "If this loan" : `If a ${usd(debt)} loan with this loan's price`} were sold off, it would cost about{" "}
            <strong className="font-semibold text-ink">{q.loss < 100 ? money(q.loss) : usd(q.loss)}</strong>. This order covers that.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {event.url && <MetalLink small href={event.url} target="_blank" rel="noopener">Open this bet on Gemini <ArrowUpRight aria-hidden="true" className="size-4" /></MetalLink>}
            <MetalButton small onClick={copy}>{copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}{copied ? "Copied" : "Copy the order"}</MetalButton>
          </div>
          {hedge?.enabled ? (
            <div className="mt-4 text-[14.5px] leading-snug text-ink-2" role="status">
              <p>On Gemini's test site, Airbag places this order for real each time it saves a loan. Test money. On the real site it stays a quote.</p>
              {placed && (
                <p className="mt-2">
                  <span className="font-semibold text-ink">Last order:</span> {placed.quantity} "No" on "{Number.isFinite(placed.strike) ? usd(placed.strike) : placed.symbol} or above" at {cents(Number(placed.price))}. Order {placed.orderId}, {placed.status}, {clock(placed.at)}.
                </p>
              )}
              {placed && Number.isFinite(placed.strike) && placed.strike !== q.strike && (
                <p className="mt-2 text-faint">The test site lists fewer bets than the real one, so the test order is on the lowest bet it has that covers this loan.</p>
              )}
              {hedge.lastError && (!placed || hedge.lastError.at > placed.at) && <p className="mt-2 text-faint">The last try did not go through: {hedge.lastError.message}</p>}
            </div>
          ) : (
            <p className="mt-4 text-[14.5px] leading-snug text-faint">A quote, not an order. Airbag does not place it: Gemini's prediction markets are real money.</p>
          )}
          {feed && <LiveBadge feed={feed} onLight className="mt-auto pt-4 !text-faint" />}
        </div>
      </div>

      <details className="mt-6 border-t border-line pt-4 text-[15px] text-ink-2">
        <summary className="cursor-pointer select-none font-semibold text-ink">How this is worked out, and what it leaves out</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>{cents(q.price)} is what it costs right now to buy "No" on Gemini's bet "{usd(q.strike)} or above". A "No" pays $1 if bitcoin ends below that price.</li>
          <li>It pays on the end date only. A dip that takes the loan and then recovers pays nothing. That gap is what Airbag itself is for.</li>
          {q.strike > reading.line + 1 && <li>{usd(q.strike)} is the lowest bet at or above this loan's price of {usd(reading.line)}. So it also pays in some cases where the loan survived.</li>}
          <li>A sell-off takes {penalty} more bitcoin than the debt is worth. That is the lending market's rule (Morpho, for loans up to {Math.round(lltv * 100)}%). {penalty} of {size === "own" ? `${debt.toFixed(2)} USDC` : usd(debt)} is {q.loss < 100 ? money(q.loss) : usd(q.loss)}.</li>
          <li>Contracts are rounded up to a whole one. Gemini's own fees are not included.</li>
        </ul>
        {order && (
          <>
            <p className="mt-4 font-semibold text-ink">The same order for Gemini's API</p>
            <pre className="mono mt-2 overflow-x-auto rounded-xl border border-line bg-page/60 p-4 text-[13px] leading-relaxed text-ink">{`POST /v1/prediction-markets/order\n${JSON.stringify(order, null, 2)}`}</pre>
            <p className="mt-2 text-[14px] leading-snug text-faint">
              {hedge?.enabled
                ? "This is what the bot sends to Gemini's test site (api.sandbox.gemini.com), signed with a test key. It is never sent to the real site."
                : "Written from Gemini's API reference. Not sent from here: placing it needs your own Gemini account and a Trader key."}
            </p>
          </>
        )}
      </details>
    </Card>
  );
}
