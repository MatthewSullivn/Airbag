// The first page a visitor sees. Five screens, each one idea: what it is, the problem, the fix (a real save,
// replayed), how it knows (Gemini's market), and the proof. Few words, one picture each.
import { useEffect, useRef } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { useCrashReplay, useLadders, useMarketHistory, useStatus } from "@/lib/api";
import { ADDRESSES, EXPLORER, LIVE_URL, SAVES, SIM_URL } from "@/recorded/proof";
import { ButtonLink, ExplorerLink, Section, Wordmark } from "@/components/bits";
import { CrashCard } from "@/components/crash-card";
import { MarketHistoryCard } from "@/components/market-parts";
import { NumberCard, recentMove } from "@/components/number-card";
import { SaveReplay } from "@/components/save-replay";
import { DotPattern } from "@/components/ui/dot-pattern";

const LINK = "underline decoration-current/30 underline-offset-[3px] hover:decoration-current";

export function Landing() {
  const { data: status } = useStatus();
  const { data: ladders } = useLadders();
  const { data: replay } = useCrashReplay();
  const live = status?.mode === "live";
  // Gemini's own history for the ladder the number comes from
  const ticker = status?.reading?.odds?.ticker ?? ladders?.events[0]?.ticker ?? null;
  const { data: historyData } = useMarketHistory(ticker);
  const history = historyData && historyData.ticker === ticker ? historyData : null;

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
    <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-6">
        <a href="/" className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
        <ButtonLink href="/app/" variant="ink" size="sm">Open the app <ArrowRight aria-hidden="true" className="size-4" /></ButtonLink>
      </header>

      <main>
        {/* 1. What it is */}
        <section className="grid items-center gap-x-14 gap-y-12 pb-12 pt-10 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="eyebrow">Runs on Arc · Odds from Gemini</p>
            <h1 className="display mt-5 text-[clamp(3rem,8vw,5.6rem)] text-ink">An airbag for your bitcoin loan.</h1>
            <p className="mt-6 max-w-[34ch] text-[1.3rem] leading-snug text-ink-2">
              When the odds of a crash get too high, it moves your own savings into the loan. So you keep your bitcoin.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="#save" variant="brand" size="lg">Watch a real save <ArrowDown aria-hidden="true" className="size-5" /></ButtonLink>
              {/* the simulator's loan is there to be pushed, so its second button goes straight to the controls */}
              {status?.mode === "sim"
                ? <ButtonLink href="/app/?demo" variant="outline" size="lg">Push a loan yourself</ButtonLink>
                : <ButtonLink href="/app/" variant="outline" size="lg">Open the app</ButtonLink>}
            </div>
          </div>
          {status ? (
            <div className="relative">
              {/* a still field of dots behind the one live thing (wide screens: on a phone it reads as a stray strip) */}
              <div aria-hidden="true" className="pointer-events-none absolute -inset-x-16 -inset-y-20 hidden [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_78%)] sm:block">
                <DotPattern width={16} height={16} cr={1.2} className="text-ink/45" />
              </div>
              <NumberCard
                beam
                className="relative"
                status={status}
                reading={status.reading}
                samples={status.samples}
                justNow={recentMove(status.log.filter((e) => !e.who), status.now)}
                footer={live
                  ? <>A real loan on Arc Testnet, right now.</>
                  : <>A simulated loan, with the market's real odds. <a href={LIVE_URL} className={LINK}>See the real one</a>.</>}
              />
            </div>
          ) : (
            <div className="min-h-[26rem] rounded-[32px] bg-panel" aria-hidden="true" />
          )}
        </section>

        {/* what it runs on: each name is a working part with its own screen in the app */}
        <ul className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-line py-6 lg:grid-cols-4" aria-label="What it runs on">
          {[
            ["Arc", "where the loan lives", "/app/#chain"],
            ["Circle", "the loan and the savings", "/app/#chain"],
            ["Gemini", "the odds", "/app/#market"],
            ["QuickNode", "the wake-up call", "/app/#chain"],
          ].map(([name, what, href]) => (
            <li key={name}>
              <a href={href} className="group block no-underline">
                <p className="flex items-center gap-1.5 text-[1.2rem] font-semibold tracking-tight text-ink">{name} <ArrowRight aria-hidden="true" className="size-4 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" /></p>
                <p className="mt-0.5 text-[15.5px] leading-snug text-ink-2">{what}</p>
              </a>
            </li>
          ))}
        </ul>

        {/* 2. The problem */}
        <Section title="One bad day can take your bitcoin." lead="You borrowed dollars against your bitcoin. If bitcoin falls below a set price, even for a minute, the bitcoin is sold. In February 2026 that is what happened.">
          <CrashCard replay={replay} />
        </Section>

        {/* 3. The fix: "Watch a real save" lands on the replay itself, so the whole card is on screen */}
        <Section title="Airbag tops up the loan before that happens." lead="Your spare dollars wait in a savings account, earning interest. When the danger gets too high, Airbag moves some into the loan. Later it moves them back.">
          <SaveReplay id="save" />
        </Section>

        {/* 4. How it knows: the market's own odds, moving. The whole market is one click away, in the app. */}
        <Section title="It reads the odds from a real market." lead="On Gemini, people bet real money on where bitcoin will be. Airbag turns those bets into one number: the chance you lose your bitcoin.">
          <MarketHistoryCard
            history={history}
            spot={status?.reading?.priceUsed ?? ladders?.spot ?? null}
            own={status?.reading ? { line: status.reading.line, odds: status.reading.decision.odds } : null}
          />
        </Section>

        {/* 5. The proof: receipts, not slogans. Each row is a save that happened, with its transactions. */}
        <Section title="It already works, on Arc.">
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
          <h2 className="display relative mx-auto max-w-[16ch] text-[clamp(2.4rem,6vw,4.4rem)]">See it {live ? "live" : "work"}.</h2>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/app/" variant="brand" size="lg">Open the app <ArrowRight aria-hidden="true" className="size-5" /></ButtonLink>
            <ButtonLink href="/app/#try" variant="panel" size="lg">Try it with my wallet</ButtonLink>
          </div>
          <p className="relative mt-6 text-[15px] text-on-panel-faint">
            Arc Testnet only. No real money.{" "}
            {status && (live
              ? <>No wallet? <a href={SIM_URL} className="text-on-panel-2 underline underline-offset-[3px] hover:text-on-panel">Push a simulated loan yourself</a>.</>
              : <>This is the simulator. <a href={LIVE_URL} className="text-on-panel-2 underline underline-offset-[3px] hover:text-on-panel">See the real loan</a>.</>)}
          </p>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-line py-7 text-[15px] text-faint">
        <p>Built on Arc with Circle's Borrow Kit and Earn Kit, Gemini's prediction market and QuickNode Streams.</p>
        <a href="https://github.com/MatthewSullivn/ubc" target="_blank" rel="noopener" className={LINK}>Code on GitHub</a>
      </footer>
    </div>
  );
}
