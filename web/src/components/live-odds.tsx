// How the one number is made, right now, in three steps a visitor can follow with their eyes:
//   1. Gemini's live prices for the bets nearest this loan's price (they tick as people trade),
//   2. the chance bitcoin ends below that price, read from those bets,
//   3. that chance doubled, against the level where Airbag steps in.
// Steps 2 and 3 are worked out on the page with the bot's own functions (src/brain.mjs) from Gemini's live feed.
// The bot's own last check is shown next to them, so nobody has to take the page's word for it.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { chanceBelowEst, makeOddsModel } from "@brain";
import { betsAround } from "@live";
import type { Ladders, Reading, Status } from "@/lib/api";
import { useLiveEvents, type GeminiFeed } from "@/lib/gemini-feed";
import type { LoanView } from "@/lib/loan-view";
import { ago, dayET, pct, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, StatusPill } from "./bits";

export const cents = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}¢`);
const pct1 = (x: number) => `${+(x * 100).toFixed(1)}%`;

/** A value that lights up for a moment when it changes, so a moving market can be seen moving. */
export function Tick({ value, children, className }: { value: string | number | null | undefined; children: React.ReactNode; className?: string }) {
  const seen = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (seen.current !== value) {
      seen.current = value;
      setN((x) => x + 1);
    }
  }, [value]);
  // a new key restarts the animation; nothing lights up on the first draw
  return <span key={n} className={cn(n > 0 && "tick-flash", className)}>{children}</span>;
}

/** Says whether the page is hearing Gemini's live feed, in words and with a dot. */
export function LiveBadge({ feed, className, onLight }: { feed: GeminiFeed; className?: string; /** On a light card instead of a dark panel. */ onLight?: boolean }) {
  const live = feed.state === "live";
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13.5px]", onLight ? "text-black/60" : "text-on-panel-faint", className)} role="status">
      <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />}
        <span className={cn("relative inline-flex size-2.5 rounded-full", live ? "bg-good" : onLight ? "bg-black/30" : "bg-on-panel-faint")} />
      </span>
      {live ? (
        <span>
          Gemini's live feed
          {feed.heard > 0 && <> · <span className="tabular-nums">{feed.heard.toLocaleString("en-US")}</span> price {feed.heard === 1 ? "update" : "updates"}</>}
        </span>
      ) : feed.state === "down" ? (
        <span>Live feed reconnecting. Showing Gemini's prices from the last 20 s.</span>
      ) : (
        <span>Connecting to Gemini's live feed…</span>
      )}
    </span>
  );
}

export function LiveOdds({ id, status, reading, view, ladders, feed, className }: {
  id?: string;
  status: Status;
  reading: Reading | null;
  /** The same moment the loan's two cards show (lib/loan-view): during an alarm, the price line as it was then. */
  view: LoanView;
  ladders: Ladders | null;
  feed: GeminiFeed;
  className?: string;
}) {
  const events = useLiveEvents(ladders, feed);
  const at = view.line ?? reading?.line ?? null;
  const limit = status.limit;

  // the bot's own rule, on the live prices: every ladder's odds at this loan's price, and the worst one counts
  const made = useMemo(() => {
    if (at == null || !events.length) return null;
    const line = at;
    const worst = makeOddsModel(events.map((e) => ({ ticker: e.ticker, ladder: e.live }))).detail(line);
    const event = events.find((e) => e.ticker === worst?.ticker) ?? events[0];
    const below = chanceBelowEst(event.live, line);
    if (!below || event.live.length < 2) return null;
    return { line, event, below, total: worst?.odds ?? Math.min(1, below.p * 2), rows: betsAround(event.live, line, 2) };
  }, [events, at]);

  if (!reading) return null;
  if (!made) {
    return (
      <Panel id={id} className={cn("scroll-mt-24", className)} aria-label="How this number is made">
        <p className="text-[16px] font-medium text-on-panel-2">How this number is made, right now</p>
        <p className="mt-3 text-[15px] text-on-panel-faint">
          {ladders?.error ? "Gemini's market is not answering right now. Until it does, Airbag watches the loan's health alone." : "Reading Gemini's market…"}
        </p>
      </Panel>
    );
  }

  const { line, event, below, total, rows } = made;
  const date = dayET(event.expiryDate);
  const lowest = event.live[0].strike, highest = event.live[event.live.length - 1].strike;
  const where = line < lowest ? "under" : line > highest ? "over" : "between";
  const over = total > limit;
  const alarm = view.danger || over;
  const bot = reading.decision.odds;
  // a bet the feed has not spoken about yet still has the server's last prices
  const fallback = (strike: number) => {
    const b = event.bets?.find((x) => x.strike === strike);
    return { bid: b?.buyNo != null && b.buyNo > 0 && b.buyNo < 1 ? 1 - b.buyNo : null, ask: b?.buyYes ?? null };
  };

  const STEP = "label text-on-panel-faint";
  const ARROW = "size-5 shrink-0 text-on-panel-faint";

  return (
    <Panel id={id} tone={view.danger ? "critical" : null} className={cn("scroll-mt-24", className)} aria-label="How this number is made, right now">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-[16px] font-medium text-on-panel-2">How this number is made, right now</p>
        <LiveBadge feed={feed} />
      </div>

      <div className="mt-6 grid items-stretch gap-x-7 gap-y-5 lg:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,0.85fr)_auto_minmax(0,1.15fr)]">
        {/* 1. the market */}
        <div className="min-w-0">
          <p className={STEP}>1 · Gemini's bets for {date}</p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_4.1rem] gap-x-2.5 text-[12.5px] text-on-panel-faint sm:grid-cols-[minmax(0,1fr)_auto_4.6rem] sm:gap-x-4">
            <span>Will bitcoin end at</span>
            <span>bid / ask</span>
            <span className="text-right">chance</span>
          </div>
          <ul className="mt-1.5 border-y border-panel-line">
            {rows.map((p) => {
              const q = p.live ? { bid: p.bid, ask: p.ask } : fallback(p.strike);
              return (
                <li key={p.strike} className="grid grid-cols-[minmax(0,1fr)_auto_4.1rem] items-baseline gap-x-2.5 border-t border-panel-line py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_4.6rem] sm:gap-x-4">
                  <span className="text-[0.95rem] font-semibold leading-tight text-on-panel sm:text-[1.02rem]">{usd(p.strike)} or above</span>
                  <span className="mono whitespace-nowrap text-[13px] text-on-panel-2 sm:text-[14px]">
                    <Tick value={q.bid} className="px-0.5 sm:px-1">{cents(q.bid)}</Tick>/<Tick value={q.ask} className="px-0.5 sm:px-1">{cents(q.ask)}</Tick>
                  </span>
                  <Tick value={p.pAbove} className="figure justify-self-end px-1 text-[1.5rem] text-on-panel sm:text-[1.7rem]">{pct1(p.pAbove)}</Tick>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-[14px] leading-snug text-on-panel-faint">
            {where === "between"
              ? <>Your price, {usd(line)}, sits between these two bets.</>
              : where === "under"
                ? <>Your price, {usd(line)}, is below every bet. Airbag extends the market's curve down to it.</>
                : <>Your price, {usd(line)}, is above every bet.</>}
          </p>
        </div>

        <span aria-hidden="true" className="grid place-items-center">
          <ArrowRight className={cn(ARROW, "hidden lg:block")} />
          <ArrowDown className={cn(ARROW, "lg:hidden")} />
        </span>

        {/* 2. the chance at this loan's price */}
        <div className="min-w-0">
          <p className={STEP}>2 · Ends below your price</p>
          <p className="figure mt-3 text-[3.4rem] text-on-panel"><Tick value={pct(below.p)} className="px-1">{pct(below.p)}</Tick></p>
          <p className="mt-2 text-[14px] leading-snug text-on-panel-faint">
            the market's chance bitcoin is below {usd(line)} on {date}{below.source === "estimated" ? ", estimated" : ""}
          </p>
        </div>

        <span aria-hidden="true" className="grid place-items-center">
          <ArrowRight className={cn(ARROW, "hidden lg:block")} />
          <ArrowDown className={cn(ARROW, "lg:hidden")} />
        </span>

        {/* 3. doubled, and what Airbag does about it */}
        <div className="min-w-0">
          <p className={STEP}>3 · Doubled: a dip at any moment counts</p>
          <p className={cn("figure mt-3 text-[3.4rem]", alarm ? "text-[#ff6b5e]" : "text-on-panel")}><Tick value={pct(total)} className="px-1">{pct(total)}</Tick></p>
          <div className="mt-2.5" role="status">
            {alarm
              ? <StatusPill tone="critical" small>{over ? `Over ${pct(limit)}. Airbag steps in.` : "Too close. Airbag steps in."}</StatusPill>
              : <StatusPill tone="good" small>Under {pct(limit)}. Airbag waits.</StatusPill>}
          </div>
          <p className="mt-2.5 text-[14px] leading-snug text-on-panel-faint">
            Airbag's own last check{bot != null ? <>: <span className="text-on-panel-2">{pct(bot)}</span></> : ""}, {ago(reading.at, status.now)}.
          </p>
        </div>
      </div>
    </Panel>
  );
}
