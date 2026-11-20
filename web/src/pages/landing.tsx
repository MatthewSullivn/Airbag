// The first page a visitor sees: a walk-through. What Airbag is (a crash test first, then the live app in a frame), who it is for,
// how it works step by step (the problem, then a real save replayed), and then in depth how it uses Gemini's
// prediction market and Arc with Circle's kits. Few words per screen, one real picture each.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bitcoin, PiggyBank, TrendingUp } from "lucide-react";
import { postJson, useCrashReplay, useGasPrices, useLadders, useMarketHistory, useStatus } from "@/lib/api";
import { symbolsOf, useGeminiFeed, useLiveEvents } from "@/lib/gemini-feed";
import { usePressed } from "@/lib/use-pressed";
import { ADDRESSES, EXPLORER, LIVE_URL, SAVES } from "@/recorded/proof";
import { pct } from "@/lib/format";
import { ExplorerLink, Section, Wordmark } from "@/components/bits";
import { Costs, MoneyMap, StreamList } from "@/components/chain-parts";
import { CrashCard } from "@/components/crash-card";
import { CrashTest } from "@/components/crash-test";
import { GeminiMarketCard } from "@/components/gemini-market-card";
import { HedgeCard } from "@/components/hedge-card";
import { LadderCard } from "@/components/ladder-card";
import { OverTime } from "@/components/market-parts";
import { OddsCheck } from "@/components/odds-check";
import { LoanCards } from "@/components/loan-cards";
import { SaveReplay } from "@/components/save-replay";
import { TiltFrame } from "@/components/ui/tilt-frame";
import { BotBadge } from "@/components/top-bar";
import { MetalLink, ShinyButton, ShinyLink } from "@/components/ui/cta";
import { DotPattern } from "@/components/ui/dot-pattern";
import { FadeIn } from "@/components/ui/fade-in";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const LINK = "underline decoration-current/30 underline-offset-[3px] hover:decoration-current";
const NAV = [["How it works", "#how"], ["Gemini", "#gemini"], ["Arc", "#arc"], ["My loan", "/app/#mine"]] as const;

export function Landing() {
  const { data: status, error } = useStatus();
  const { data: ladders } = useLadders();
  const { data: replay } = useCrashReplay();
  const { data: gas } = useGasPrices();
  const live = status?.mode === "live";
  const reading = status?.reading ?? null;
  // what the bot did for its own loan (a connected wallet's moves are marked with that wallet, and belong to My loan)
  const botLog = useMemo(() => (status?.log ?? []).filter((e) => !e.who), [status]);
  const botActions = useMemo(() => botLog.filter((e) => e.level === "action"), [botLog]);
  // The first screen's own button: push the simulated loan to the edge, right there in the frame.
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

  // A link like /#save from the app: the target only exists once this has drawn, and the cards above it grow as
  // their data arrives. So go there now, and again each time one of the three loads, until the visitor moves.
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
  const loaded = `${!!status}${!!replay}${!!ladders}`;
  useEffect(() => {
    if (location.hash && !moved.current) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
  }, [loaded]);

  return (
    <>
      {/* one bar for the whole walk: it stays in view, so any part is one click away */}
      <header className="sticky top-0 z-50 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <a href="/" className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
          <nav aria-label="On this page" className="hidden items-center gap-7 text-[15px] font-medium text-ink-2 md:flex">
            {NAV.map(([label, href]) => <a key={href} href={href} className="no-underline hover:text-ink">{label}</a>)}
          </nav>
          <ShinyLink href="/app/" small>Live demo <ArrowRight aria-hidden="true" className="size-4" /></ShinyLink>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
        <main>
          {/* 1. What it is: the words, then the live app itself in a frame that lies flat as you scroll */}
          <section className="relative pb-10 pt-10 sm:pt-16">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_70%)]">
              <DotPattern width={18} height={18} cr={1.15} className="text-ink/30" />
            </div>
            <div className="relative text-center">
              <p className="eyebrow">Crash insurance for bitcoin loans</p>
              <h1 className="display mx-auto mt-5 max-w-[14ch] text-[clamp(3rem,8.4vw,6.2rem)] text-ink">
                An airbag for your <span className="accent">bitcoin loan.</span>
              </h1>
              {/* the problem first, in one line, then what Airbag does about it */}
              <p className="mx-auto mt-6 max-w-[40ch] text-[1.3rem] leading-snug text-ink-2">
                <strong className="font-semibold text-ink">Borrow against bitcoin, and one bad day can sell it.</strong> Airbag sees the crash coming in Gemini's odds and pays your loan down first, with your own savings.
              </p>
            </div>
            {/* the idea in ten seconds: February's crash, without and then with Airbag. It also carries the two ways on:
                a real save, and the live demo. */}
            <CrashTest replay={replay} className="relative mx-auto mt-8 max-w-[1040px] sm:mt-10" />
            <TiltFrame className="relative mt-8 sm:mt-9">
              {status ? (
                <>
                  {/* what this is, in one line, and the one thing to press */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1 pt-0.5 sm:px-2">
                    <p className="flex min-w-0 flex-1 basis-64 items-start gap-2.5 text-[15px] leading-snug text-ink-2 sm:text-[16px]">
                      <span aria-hidden="true" className="relative mt-[0.4em] flex size-2.5 shrink-0">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-good" />
                      </span>
                      <span>
                        <strong className="font-semibold text-ink">{live ? "Live on Arc Testnet." : "Live demo."}</strong>{" "}
                        {live
                          ? "A real bitcoin loan. Airbag is watching it right now."
                          : spent
                            ? "This simulated loan has been pushed many times and its savings are used up."
                            : "A simulated bitcoin loan with the market's real odds. Push it into danger and watch."}
                      </span>
                    </p>
                    {live ? (
                      // on the real loan there is nothing for a visitor to press: show that the bot is at work
                      <BotBadge status={status} error={error} />
                    ) : (
                      <ShinyButton small onClick={push} disabled={pushing || !!pressed.pending || atRisk || spent}>Push it to the edge</ShinyButton>
                    )}
                  </div>
                  {pushNote && <p role="status" className="mb-3 px-1 text-[14.5px] text-ink-2 sm:px-2">{pushNote}</p>}
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
            </TiltFrame>
          </section>

          {/* 2. Who it is for */}
          <section id="who" className="scroll-mt-20 py-14 sm:py-20">
            <FadeIn distance={18} duration={0.7} amount={0.3}>
              <h2 className="display max-w-[16ch] text-[clamp(2.2rem,5.2vw,3.9rem)] text-ink">Who it is <span className="accent">for.</span></h2>
            </FadeIn>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {([
                [Bitcoin, "240 89 31", "You borrowed against your bitcoin.", "Keep it through a bad day, without watching charts all night."],
                [TrendingUp, "57 135 229", "You trade prediction markets.", "The odds you already read now guard a loan."],
                [PiggyBank, "25 158 112", "You have dollars sitting idle.", "They earn interest in savings until the loan needs them."],
              ] as const).map(([Icon, glow, who, why]) => (
                <SpotlightCard key={who} glow={glow}>
                  <span className="grid size-12 place-items-center rounded-2xl" style={{ background: `rgb(${glow} / 0.18)`, color: `rgb(${glow})` }} aria-hidden="true"><Icon className="size-6" /></span>
                  <p className="display mt-6 text-[1.7rem] text-on-panel">{who}</p>
                  <p className="mt-3 text-[1.05rem] leading-snug text-on-panel-2">{why}</p>
                </SpotlightCard>
              ))}
            </div>
          </section>

          {/* 3. How it works, step by step */}
          <div id="how" className="scroll-mt-20">
            <Section step="1" title={<>One bad day can <span className="accent">take your bitcoin.</span></>} lead="You borrowed dollars against your bitcoin. If bitcoin falls below a set price, even for a minute, the bitcoin is sold. That is what happened in February 2026. Here is the crash test from the top, day by day.">
              <CrashCard replay={replay} />
            </Section>
            {/* "Watch a real save" lands on the replay itself, so the whole card is on screen */}
            <Section step="2" title={<>Airbag pays the loan down <span className="accent">before that happens.</span></>} lead="Your spare dollars wait in a savings account, earning interest. When the danger gets too high, Airbag pays back part of the loan with them. A smaller loan means bitcoin must fall much further before yours is sold. Later it puts the dollars back.">
              <SaveReplay id="save" />
            </Section>
          </div>

          {/* 4. In depth: Gemini's prediction market */}
          <Section id="gemini" step="3" title={<>The danger is read from <span className="accent">Gemini's market.</span></>} lead="On Gemini, people bet real money on where bitcoin will be on a date. Those prices are odds. Airbag checks the loan against them every 5 seconds.">
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
            <div className="mt-10 grid gap-4">
              <LadderCard ladders={ladders} reading={reading} limit={status?.limit} />
              {status && <OverTime history={history} spot={spot} samples={status.samples} actions={botActions} limit={status.limit} ofWallet={false} own={own} />}
              <OddsCheck />
              {status && <HedgeCard ladders={ladders} reading={reading} lltv={status.lltv} feed={feed} hedge={status.hedge} />}
            </div>
          </Section>

          {/* 5. In depth: Arc, Circle and QuickNode */}
          <Section id="arc" step="4" title={<>The money moves on <span className="accent">Arc.</span></>} lead="The loan and the savings are Circle's own kits on Arc, where fees are paid in dollars. Our guard contract sits between them, and a QuickNode Stream wakes the bot the moment the loan moves.">
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

          {/* The way in */}
          <section className="relative mb-16 overflow-hidden rounded-[36px] bg-panel px-7 py-14 text-center text-on-panel sm:px-12 sm:py-20">
            <DotPattern width={20} height={20} cr={1.2} className="text-on-panel/20 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
            <h2 className="display relative mx-auto max-w-[16ch] text-[clamp(2.4rem,6vw,4.4rem)]">See it <span className="accent">{live ? "live." : "work."}</span></h2>
            <div className="relative mt-9 flex flex-wrap justify-center gap-3">
              <ShinyLink href="/app/">Open the live demo <ArrowRight aria-hidden="true" className="size-5" /></ShinyLink>
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
