// The first page a visitor sees. Five screens, each one idea: what it is, the problem, the fix (a real save,
// replayed), how it knows (Gemini's market), and the proof. Few words, one picture each.
import { useEffect } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { useCrashReplay, useLadders, useStatus } from "@/lib/api";
import { ADDRESSES, EXPLORER, LIVE_URL, OTHER_SAVES, SIM_URL } from "@/recorded/proof";
import { ButtonLink, ExplorerLink, Section, Wordmark } from "@/components/bits";
import { CrashCard } from "@/components/crash-card";
import { LadderCard } from "@/components/ladder-card";
import { NumberCard, recentMove } from "@/components/number-card";
import { SaveReplay } from "@/components/save-replay";

const LINK = "underline decoration-current/30 underline-offset-[3px] hover:decoration-current";

export function Landing() {
  const { data: status } = useStatus();
  const { data: ladders } = useLadders();
  const { data: replay } = useCrashReplay();
  const live = status?.mode === "live";
  // a link like /#save from the app: the sections only exist once this has drawn, so go there now
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, []);

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
            <NumberCard
              status={status}
              reading={status.reading}
              samples={status.samples}
              justNow={recentMove(status.log.filter((e) => !e.who), status.now)}
              footer={live
                ? <>A real loan on Arc Testnet, right now.</>
                : <>A simulated loan, with the market's real odds. <a href={LIVE_URL} className={LINK}>See the real one</a>.</>}
            />
          ) : (
            <div className="min-h-[26rem] rounded-[32px] bg-panel" aria-hidden="true" />
          )}
        </section>

        {/* what it runs on: each name is a working part with its own screen in the app */}
        <ul className="grid gap-x-8 gap-y-6 border-y border-line py-7 sm:grid-cols-2 lg:grid-cols-4" aria-label="What it runs on">
          {[
            ["Arc", "The loan lives on Arc. Fees are paid in dollars.", "/app/#chain"],
            ["Circle", "Borrow Kit for the loan. Earn Kit for the savings.", "/app/#chain"],
            ["Gemini", "Its prediction market sets the odds.", "/app/#market"],
            ["QuickNode", "Streams tell the live bot the moment Arc moves.", "/app/#chain"],
          ].map(([name, what, href]) => (
            <li key={name}>
              <a href={href} className="group block no-underline">
                <p className="flex items-center gap-1.5 text-[1.2rem] font-semibold tracking-tight text-ink">{name} <ArrowRight aria-hidden="true" className="size-4 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" /></p>
                <p className="mt-1 text-[15.5px] leading-snug text-ink-2">{what}</p>
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

        {/* 4. How it knows */}
        <Section title="It reads the odds from a real market." lead="On Gemini, people bet real money on where bitcoin will be. Airbag turns those bets into one number: the chance you lose your bitcoin.">
          <LadderCard ladders={ladders} reading={status?.reading ?? null} limit={status?.limit} />
        </Section>

        {/* 5. The proof */}
        <Section title="It already works, on Arc.">
          <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-3">
            {[
              ["3 s", "from danger to safe"],
              ["$0.01", "in fees for the save, paid in USDC"],
              ["0", "of your keys held by the bot"],
            ].map(([big, small]) => (
              <div key={small}>
                <dd className="figure text-[clamp(4.5rem,11vw,7.5rem)] text-ink">{big}</dd>
                <dt className="mt-3 max-w-[18ch] text-[1.15rem] leading-snug text-ink-2">{small}</dt>
              </div>
            ))}
          </dl>
          <details className="mt-12 border-t border-line pt-6 text-[16px] text-ink-2">
            <summary className="cursor-pointer select-none font-semibold text-ink">See the contracts and the other saves</summary>
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
            <ul className="mt-6 space-y-3">
              {OTHER_SAVES.map((s) => (
                <li key={s.save}>
                  <span className="font-semibold text-ink">{s.when}.</span> {s.what}{" "}
                  <ExplorerLink explorer={EXPLORER} kind="tx" id={s.push}>push</ExplorerLink>, <ExplorerLink explorer={EXPLORER} kind="tx" id={s.save}>save</ExplorerLink>
                </li>
              ))}
            </ul>
          </details>
        </Section>

        {/* The way in */}
        <section className="mb-16 rounded-[36px] bg-panel px-7 py-14 text-center text-on-panel sm:px-12 sm:py-20">
          <h2 className="display mx-auto max-w-[16ch] text-[clamp(2.4rem,6vw,4.4rem)]">See it {live ? "live" : "work"}.</h2>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/app/" variant="brand" size="lg">Open the app <ArrowRight aria-hidden="true" className="size-5" /></ButtonLink>
            <ButtonLink href="/app/#try" variant="panel" size="lg">Try it with my wallet</ButtonLink>
          </div>
          <p className="mt-6 text-[15px] text-on-panel-faint">
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
