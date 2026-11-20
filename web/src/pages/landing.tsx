// The first page a visitor sees. Its first screen plays February 2026's crash on a trading chart, with Airbag and
// (at the press of a switch) without it (components/crash-story.tsx). After it: the real loan, live; a real save,
// recorded; where the odds come from (Gemini); where the money moves (Arc); the receipts. Few words per screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll } from "motion/react";
import { postJson, useGasPrices, useLadders, useMarketHistory, useStatus } from "@/lib/api";
import { symbolsOf, useGeminiFeed, useLiveEvents } from "@/lib/gemini-feed";
import { usePressed } from "@/lib/use-pressed";
import { ADDRESSES, EXPLORER, LIVE_URL, SAVES } from "@/recorded/proof";
import { pct } from "@/lib/format";
import { ExplorerLink, Section, Wordmark } from "@/components/bits";
import { Costs, MoneyMap, StreamList } from "@/components/chain-parts";
import { CrashStory } from "@/components/crash-story";
import { GeminiMarketCard } from "@/components/gemini-market-card";
import { HedgeCard } from "@/components/hedge-card";
import { LadderCard } from "@/components/ladder-card";
import { OverTime } from "@/components/market-parts";
import { OddsCheck } from "@/components/odds-check";
import { LoanCards } from "@/components/loan-cards";
import { SaveReplay } from "@/components/save-replay";
import { BotBadge } from "@/components/top-bar";
import { MetalLink, ShinyButton, ShinyLink } from "@/components/ui/cta";
import { SegmentedControl } from "@/components/ui/segmented-control";

const LINK = "underline decoration-current/30 underline-offset-[3px] hover:decoration-current";
const WIDTH = "mx-auto w-full max-w-[1240px] px-5 sm:px-8";
const NAV = [["How it works", "#how"], ["Gemini", "#gemini"], ["Arc", "#arc"], ["My loan", "/app/#mine"]] as const;
// more about the odds, one thing at a time
const DEEPER = [
  { value: "curve", label: "Your loan on the curve" },
  { value: "time", label: "Hour by hour" },
  { value: "check", label: "Are the odds any good?" },
  { value: "hedge", label: "Insurance" },
];

export function Landing() {
  const { data: status, error } = useStatus();
  const { data: ladders } = useLadders();
  const { data: gas } = useGasPrices();
  const live = status?.mode === "live";
  const reading = status?.reading ?? null;
  // what the bot did for its own loan (a connected wallet's moves are marked with that wallet, and belong to My loan)
  const botLog = useMemo(() => (status?.log ?? []).filter((e) => !e.who), [status]);
  const botActions = useMemo(() => botLog.filter((e) => e.level === "action"), [botLog]);
  // The simulator's own button: push the simulated loan to the edge, right there on the page.
  // (The live bot's loan can only be pushed with the team's key, from the app.)
  const pressed = usePressed(status, botActions[0]?.t ?? null);
  const [pushing, setPushing] = useState(false);
  const [pushNote, setPushNote] = useState("");
  const atRisk = !!status && !!reading && ((reading.decision.odds ?? 0) > status.limit || reading.health < status.rule.actBelowHealth);
  // every save keeps some of the simulated savings in the loan, so after a dozen pushes there is nothing left to save with
  const spent = !!reading && (reading.savings?.balance ?? 0) < 1;
  const push = async () => {
    setPushing(true);
    setPushNote("");
    pressed.press("push");
    try {
      await postJson("/api/demo/push", {});
    } catch (e) {
      pressed.clear();
      const why = (e as Error).message;
      setPushNote(/already at the edge/.test(why) ? "It is already at the edge. Give Airbag a few seconds." : `That did not work: ${why}`);
    } finally {
      setPushing(false);
    }
  };

  // Gemini's market for the ladder the number comes from: the bot's own read of it (every 20 s) with Gemini's
  // live feed laid over it, so the prices on this page move the moment the market does. And its hourly history.
  const feed = useGeminiFeed(symbolsOf(ladders));
  const liveEvents = useLiveEvents(ladders, feed);
  const ticker = reading?.odds?.ticker ?? ladders?.events[0]?.ticker ?? null;
  const event = liveEvents.find((e) => e.ticker === ticker) ?? liveEvents[0];
  const { data: historyData } = useMarketHistory(ticker);
  const history = historyData && historyData.ticker === ticker ? historyData : null;
  const spot = reading?.priceUsed ?? ladders?.spot ?? null;
  const own = reading ? { line: reading.line, odds: reading.decision.odds } : null;
  // the bet nearest bitcoin's price: its Yes price in cents is the example in the steps (54 until it has loaded)
  const nearest = event && spot != null ? [...event.live].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0] : null;
  const cents = nearest ? Math.round(nearest.pAbove * 100) : 54;
  const [deeper, setDeeper] = useState("curve");

  // A link like /#save from the app: the target only exists once this has drawn, and the cards above it grow as
  // their data arrives. So go there now, and again each time one of them loads, until the visitor moves.
  const moved = useRef(false);
  useEffect(() => {
    const stop = () => { moved.current = true; };
    const opts = { passive: true, once: true } as const;
    addEventListener("wheel", stop, opts);
    addEventListener("touchmove", stop, opts);
    addEventListener("keydown", stop, opts);
    addEventListener("pointerdown", stop, opts);
    return () => { for (const e of ["wheel", "touchmove", "keydown", "pointerdown"]) removeEventListener(e, stop); };
  }, []);
  const loaded = `${!!status}${!!ladders}`;
  useEffect(() => {
    if (location.hash && !moved.current) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
  }, [loaded]);

  // how far down the page the visitor is: a thin line along the bar's lower edge
  const { scrollYProgress } = useScroll();

  return (
    <>
      {/* one bar for the whole walk: it stays in view, so any part is one click away */}
      <header className="sticky top-0 z-50 border-b border-line bg-page/85 backdrop-blur-md">
        <div className={`${WIDTH} flex items-center justify-between gap-4 py-3`}>
          <a href="/" className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
          <nav aria-label="On this page" className="hidden items-center gap-7 text-[15px] font-medium text-ink-2 md:flex">
            {NAV.map(([label, href]) => <a key={href} href={href} className="no-underline hover:text-ink">{label}</a>)}
          </nav>
          <ShinyLink href="/app/" small>Live demo</ShinyLink>
        </div>
        <motion.div aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 origin-left bg-brand" style={{ scaleX: scrollYProgress }} />
      </header>

      <div className={WIDTH}>
        <main>
          {/* 1. The first screen: what Airbag is, and February's crash played on a chart, with it and without it */}
          <CrashStory>
            <h1 className="display max-w-[13ch] text-balance text-[clamp(2.7rem,10vw,3.6rem)] text-ink lg:text-[clamp(3rem,4.3vw,4.1rem)]">Keep your bitcoin through a crash.</h1>
            {/* the problem first, then what Airbag does about it */}
            <p className="mt-5 max-w-[42ch] text-[1.1rem] leading-relaxed text-ink-2 sm:text-[1.25rem] lg:mt-6">
              Borrow against bitcoin, and one bad day can sell it. Airbag sees the crash coming in Gemini's odds and pays your loan down first, with your own savings.
            </p>
            {/* on a phone the chart comes straight after the sentence, and the bar's own button is the way to the demo */}
            <div className="mt-8 hidden flex-wrap items-center gap-x-6 gap-y-3 sm:flex">
              <a href="/app/" className="btn-shiny">Open the live demo</a>
              <a href="#how" className={`${LINK} text-[1.05rem] font-medium text-ink`}>See how it works</a>
            </div>
            {/* what it is built on, for those who look for it (on a phone the chart comes first; the page's last line says it too) */}
            <p className="mt-8 hidden max-w-[44ch] text-[15px] leading-relaxed text-faint sm:block">
              Live on Arc Testnet with Circle's kits. Odds from Gemini's prediction market. Woken by a QuickNode Stream.
            </p>
          </CrashStory>

          {/* 2. The real thing: the loan the bot guards, live */}
          <Section
            id="live"
            title={live ? <>That was a replay. <span className="accent">This loan is real, right now.</span></> : <>That was a replay. <span className="accent">Now push a loan yourself.</span></>}
            lead={live
              ? "A real bitcoin loan on Arc Testnet. Its number is worked out from Gemini's live prices, and Airbag is watching it as you read this."
              : spent
                ? "This simulated loan has been pushed many times, and its savings are used up."
                : "A simulated bitcoin loan with the market's real odds. Push it into danger and watch Airbag step in."}
          >
            {status ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <p className="text-[15.5px] text-ink-2">
                    <strong className="font-semibold text-ink">{live ? "Live on Arc Testnet." : "Simulator."}</strong>{" "}
                    {live ? "Nobody can push this loan from the page: it is real." : "No wallet needed."}
                  </p>
                  {live ? (
                    // on the real loan there is nothing for a visitor to press: show that the bot is at work
                    <BotBadge status={status} error={error} />
                  ) : (
                    <ShinyButton small onClick={push} disabled={pushing || !!pressed.pending || atRisk || spent}>Push it to the edge</ShinyButton>
                  )}
                </div>
                {pushNote && <p role="status" className="mb-3 text-[14.5px] text-ink-2">{pushNote}</p>}
                <LoanCards
                  status={status}
                  reading={reading}
                  samples={status.samples}
                  actions={botActions}
                  pending={pressed.pending}
                  split="md"
                  footer={<a href="#gemini" className="underline decoration-on-panel-faint/60 underline-offset-[3px] hover:decoration-on-panel">Where does this number come from?</a>}
                />
              </>
            ) : (
              <div className="min-h-[24rem] rounded-[28px] bg-panel" aria-hidden="true" />
            )}
          </Section>

          {/* 3. A real save: every step a transaction on Arc ("Watch a real save" in the app lands on the card itself) */}
          <Section
            title={<>A real save, <span className="accent">recorded on Arc.</span></>}
            lead="No replayed prices this time. A wallet pushed its own loan to the edge on Arc Testnet, and three seconds later Airbag had paid part of it back with the owner's savings. Later it gave them back."
          >
            <SaveReplay id="save" />
          </Section>

          {/* 4. Gemini's prediction market: where the number comes from, then more for those who want it */}
          <Section id="gemini" title={<>The odds come from <span className="accent">Gemini's market.</span></>} lead="On Gemini, people bet real money on where bitcoin will be on a date. Those prices are odds. Airbag checks the loan against them every 5 seconds.">
            <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-[0.85fr_1.15fr]">
              <GeminiMarketCard event={event} spot={spot} feed={feed} />
              <ol className="space-y-8 border-l border-line pl-7">
                {([
                  ["Gemini lists the bets.", "Will bitcoin be at this price or above on the date? People buy Yes or No with real money."],
                  ["Each price is a chance.", `A Yes at ${cents} cents means the market gives it ${cents}%. Together the bets draw a curve.`],
                  ["Airbag finds your loan on that curve.", `It doubles the chance, because a dip at any moment counts. Over ${status ? pct(status.limit) : "5%"} and it steps in.`],
                ] as const).map(([head, text]) => (
                  <li key={head} className="relative">
                    <span aria-hidden="true" className="absolute -left-[2.16rem] top-2 size-3 rounded-full bg-brand ring-4 ring-page" />
                    <p className="display text-[1.5rem] text-ink">{head}</p>
                    <p className="mt-1.5 max-w-[44ch] text-[1.05rem] leading-snug text-ink-2">{text}</p>
                  </li>
                ))}
              </ol>
            </div>
            {/* one of four at a time: the curve, the market's history, the check of its odds, and the hedge */}
            <div className="mt-14">
              <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <SegmentedControl aria-label="More about the odds" value={deeper} onValueChange={setDeeper} options={DEEPER} size="md" className="w-max border-line bg-ink/5 [&_button]:whitespace-nowrap" pillColor="var(--paper)" />
              </div>
              <div className="mt-5">
                {deeper === "curve" && <LadderCard ladders={ladders} reading={reading} limit={status?.limit} />}
                {deeper === "time" && (status ? <OverTime history={history} spot={spot} samples={status.samples} actions={botActions} limit={status.limit} ofWallet={false} own={own} /> : null)}
                {deeper === "check" && <OddsCheck />}
                {deeper === "hedge" && (status ? <HedgeCard ladders={ladders} reading={reading} lltv={status.lltv} feed={feed} hedge={status.hedge} /> : null)}
              </div>
            </div>
          </Section>

          {/* 5. Arc, Circle and QuickNode: where the money moves */}
          <Section id="arc" title={<>The money moves on <span className="accent">Arc.</span></>} lead="The loan and the savings are Circle's own kits on Arc, where fees are paid in dollars. Our guard contract sits between them, and a QuickNode Stream wakes the bot the moment the loan moves.">
            <div className="grid gap-4">
              <MoneyMap status={status} marketUrl={event?.url ?? null} />
              <div className="grid gap-4 lg:grid-cols-2">
                {status && <StreamList status={status} />}
                <Costs gas={gas} />
              </div>
            </div>
          </Section>

          {/* 6. The proof: receipts. Each row is a save that happened, with its transactions. */}
          <Section id="proof" title={<>It already works, <span className="accent">on Arc.</span></>}>
            <ol className="border-t border-line">
              {SAVES.map((s) => (
                <li key={s.save} className="grid grid-cols-2 items-baseline gap-x-6 gap-y-1 border-b border-line py-5 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
                  <p className="col-span-2 text-[1.05rem] text-ink-2 sm:col-span-1">
                    <span className="font-semibold text-ink">{s.when}</span>
                    <span className="block text-[15px]">{s.who}</span>
                  </p>
                  <p className="text-[15px] text-ink-2"><span className="figure mr-1.5 text-[2.2rem] text-ink">{s.secs} s</span>from danger to safe</p>
                  <p className="text-[15px] text-ink-2"><span className="figure mr-1.5 text-[2.2rem] text-ink">${s.fee}</span>in fees, paid in USDC</p>
                  <p className="col-span-2 flex gap-4 text-[15px] text-ink-2 sm:col-span-1">
                    <ExplorerLink explorer={EXPLORER} kind="tx" id={s.push}>the push</ExplorerLink>
                    <ExplorerLink explorer={EXPLORER} kind="tx" id={s.save}>the save</ExplorerLink>
                  </p>
                </li>
              ))}
            </ol>
            <details className="mt-8 text-[16px] text-ink-2">
              <summary className="cursor-pointer select-none font-semibold text-ink">See the contracts</summary>
              <ul className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                {[
                  ["The loan (Morpho Blue, through Circle's Borrow Kit)", ADDRESSES.morpho],
                  ["The savings (Circle's Earn Kit vault)", ADDRESSES.vault],
                  ["AirbagGuard, our contract", ADDRESSES.guard],
                  ["The bot's own key", ADDRESSES.botKey],
                ].map(([label, address]) => (
                  <li key={address} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line pb-3">
                    <span>{label}</span>
                    <ExplorerLink explorer={EXPLORER} kind="address" id={address} />
                  </li>
                ))}
              </ul>
            </details>
          </Section>

          {/* 7. Who it is for: three people, a plain sentence each */}
          <section id="who" className="scroll-mt-20 py-14 sm:py-20">
            <h2 className="display max-w-[16ch] text-[clamp(2.2rem,5.2vw,3.9rem)] text-ink">Who it is <span className="accent">for.</span></h2>
            <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-3">
              {([
                ["You borrowed against your bitcoin.", "Keep it through a bad day, without watching charts all night."],
                ["You trade prediction markets.", "The odds you already read now guard a loan."],
                ["You have dollars sitting idle.", "They earn interest in savings until the loan needs them."],
              ] as const).map(([who, why]) => (
                <div key={who} className="border-t-2 border-ink pt-5">
                  <p className="display text-[1.75rem] leading-[1.05] text-ink">{who}</p>
                  <p className="mt-3 max-w-[32ch] text-[1.1rem] leading-relaxed text-ink-2">{why}</p>
                </div>
              ))}
            </div>
          </section>

          {/* The way in */}
          <section className="relative mb-16 overflow-hidden rounded-[28px] bg-panel px-7 py-14 text-on-panel sm:px-12 sm:py-20">
            <h2 className="display relative max-w-[18ch] text-[clamp(2.4rem,6vw,4.4rem)]">See it <span className="accent">{live ? "live, on a real loan." : "work."}</span></h2>
            <div className="relative mt-9 flex flex-wrap gap-3">
              <ShinyLink href="/app/">Open the live demo</ShinyLink>
              <MetalLink href="/app/#mine">Protect my own loan</MetalLink>
            </div>
            <p className="relative mt-6 text-[15px] text-on-panel-faint">
              Arc Testnet only. No real money.{" "}
              {status && (live
                ? <>No wallet? <a href="#save" className="text-on-panel-2 underline underline-offset-[3px] hover:text-on-panel">Watch a real save, replayed</a>.</>
                : <>This is the simulator. <a href={LIVE_URL} className="text-on-panel-2 underline underline-offset-[3px] hover:text-on-panel">See the real loan</a>.</>)}
            </p>
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-line py-7 text-[15px] text-faint">
          <p>Built on Arc with Circle's Borrow Kit and Earn Kit, Gemini's prediction market and QuickNode Streams.</p>
          <a href="https://github.com/MatthewSullivn/airbag" target="_blank" rel="noopener" className={LINK}>Code on GitHub</a>
        </footer>
      </div>
    </>
  );
}
