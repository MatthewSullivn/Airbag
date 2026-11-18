// The app. Two screens: the live demo (a loan Airbag is guarding right now) and my loan (do it with your own
// wallet). How the number is made and what happens on Arc are explained on the first page, not here.
import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { useStatus } from "@/lib/api";
import { short } from "@/lib/format";
import { useWallet } from "@/wallet/use-wallet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MetalButton } from "@/components/ui/cta";
import { Wordmark } from "@/components/bits";
import { DemoDrawer, useDemoDrawer } from "@/components/demo-drawer";
import { Facts, Moves } from "@/components/loan-parts";
import { freshSave, NumberCard, recentMove } from "@/components/number-card";
import { PriceCard } from "@/components/price-card";
import { SiteFooter } from "@/components/site-footer";
import { BotBadge, ModeBadge } from "@/components/top-bar";
import { Wizard } from "@/components/wizard";

const SCREENS = [
  { value: "demo", label: "Live demo" },
  { value: "mine", label: "My loan" },
];
// The market and the chain used to be screens here. They are parts of the first page now, so old links go there.
const MOVED: Record<string, string> = { market: "/#gemini", chain: "/#arc" };
const hash = () => location.hash.replace("#", "");
const screenFromHash = () => (hash() === "mine" || hash() === "try" ? "mine" : "demo");
const LINK = "font-semibold text-ink underline decoration-current/30 underline-offset-[3px] hover:decoration-current";

export function Dashboard() {
  const { data: status, error } = useStatus();
  const wallet = useWallet();
  const demo = useDemoDrawer(status);
  const [screen, setScreen] = useState(screenFromHash);
  useEffect(() => {
    const onHash = () => {
      if (MOVED[hash()]) { location.replace(MOVED[hash()]); return; }
      setScreen(screenFromHash());
      scrollTo({ top: 0, behavior: "instant" });
    };
    if (MOVED[hash()]) location.replace(MOVED[hash()]);
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (next: string) => {
    if (next !== screen) scrollTo({ top: 0, behavior: "instant" });   // a new screen starts at its top
    setScreen(next);
    history.replaceState(null, "", `${location.pathname}${location.search}${next === "demo" ? "" : `#${next}`}`);
  };

  // 1 and 2 switch screens: handy on stage, where hunting for a tab with the mouse costs seconds
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const next = SCREENS[Number(e.key) - 1];
      if (next) go(next.value);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // go only touches state setters and the address bar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live demo: always the loan this server's own bot guards (the simulated one on the simulator).
  const botLog = useMemo(() => status?.log ?? [], [status]);
  const botActions = useMemo(() => botLog.filter((e) => e.level === "action" && !e.who), [botLog]);

  // My loan: the connected (or looked-up) wallet's own loan, with only its own moves.
  const W = wallet.view;
  const mine = wallet.how === "connected";
  const who = W?.reading && !W.protectedHere ? W.address.toLowerCase() : null;
  const ownLog = useMemo(() => (status ? (who ? status.log.filter((e) => e.who === who) : status.log) : []), [status, who]);
  const ownActions = useMemo(() => ownLog.filter((e) => e.level === "action" && (who ? true : !e.who)), [ownLog, who]);
  // the wallet this server's own bot protects is the demo loan itself
  const own = W?.reading
    ? W.protectedHere
      ? { reading: status?.reading ?? null, samples: status?.samples ?? [] }
      : { reading: W.reading, samples: wallet.samples }
    : null;

  // After "Push it to the edge" or "Calm it down" in the steps, bring the wallet's own loan into view:
  // that is where the number turns red and Airbag answers, and nobody should have to hunt for it.
  const ownRef = useRef<HTMLElement>(null);
  const lastStep = wallet.steps[wallet.steps.length - 1];
  useEffect(() => {
    if (lastStep?.state === "done" && /^(Pushed|Calmer)\./.test(lastStep.text)) ownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lastStep?.id, lastStep?.state, lastStep?.text]);

  // A demo button was pressed: say so on the big number at once (the chain takes a few seconds to answer),
  // and bring the number into view. Cleared when the loan's line has moved, or after 15 s.
  const [pressed, setPressed] = useState<{ kind: "push" | "reset"; at: number; line: number | null; move: number | null } | null>(null);
  const lineNow = status?.reading?.line ?? null;
  const lastMove = botActions[0]?.t ?? null;
  useEffect(() => {
    if (!pressed) return;
    // the line moved, or the bot has already answered (its save can put the line right back where it was)
    if ((lineNow != null && pressed.line != null && Math.abs(lineNow - pressed.line) > 1) || lastMove !== pressed.move) { setPressed(null); return; }
    const t = setTimeout(() => setPressed(null), Math.max(0, 15_000 - (Date.now() - pressed.at)));
    return () => clearTimeout(t);
  }, [pressed, lineNow, lastMove]);
  const pending = pressed ? (pressed.kind === "push" ? "Pushing the loan…" : "Resetting…") : null;

  const live = status?.mode === "live";

  return (
    <>
      {/* The same bar as the first page. On a phone the two screens get their own row, and the bar scrolls away. */}
      <header className="z-50 border-b border-line bg-page/85 backdrop-blur-md md:sticky md:top-0">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-8">
            <a href="/" className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
            <nav aria-label="Site" className="hidden items-center gap-7 text-[15px] font-medium text-ink-2 lg:flex">
              <a href="/" className="no-underline hover:text-ink">Home</a>
              <a href="/#how" className="no-underline hover:text-ink">How it works</a>
            </nav>
          </div>
          <nav aria-label="Screens" className="order-3 w-full md:order-none md:w-auto">
            <SegmentedControl aria-label="Screen" value={screen} onValueChange={go} options={SCREENS} size="md" className="border-line bg-ink/5" pillColor="var(--paper)" />
          </nav>
          <MetalButton small onClick={() => { go("mine"); if (!wallet.address) wallet.connect(); }}>
            <Wallet aria-hidden="true" className="size-4" />
            {wallet.canSign && wallet.address ? short(wallet.address) : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></>}
          </MetalButton>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
        {status ? (
          <main className="grid gap-3 pb-14 pt-5">
            {screen === "demo" && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-2 pt-3 sm:pt-6">
                  <h1 className="display max-w-[18ch] text-[clamp(2rem,4.4vw,3.2rem)] text-ink">
                    {live ? <>A real loan, <span className="accent">guarded right now.</span></> : <>Push this loan. <span className="accent">Watch Airbag save it.</span></>}
                  </h1>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-1">
                    <ModeBadge status={status} />
                    <BotBadge status={status} error={error} />
                  </span>
                </div>
                <DemoDrawer
                  status={status}
                  open={demo.open}
                  onClose={() => demo.setOpen(false)}
                  onActs={(kind) => {
                    setPressed({ kind, at: Date.now(), line: status.reading?.line ?? null, move: lastMove });
                    scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
                <div className="grid gap-3 lg:grid-cols-2">
                  <NumberCard
                    status={status}
                    reading={status.reading}
                    samples={status.samples}
                    pending={pending}
                    justNow={recentMove(botActions, status.now)}
                    lastSave={freshSave(botActions, status.now)}
                    footer={<a href="/#gemini" className="underline decoration-on-panel-faint/60 underline-offset-[3px] hover:decoration-on-panel">Where does this number come from?</a>}
                  />
                  <PriceCard status={status} reading={status.reading} samples={status.samples} />
                </div>
                <Facts reading={status.reading} />
                <Moves log={botLog} empty="Nothing yet. It is watching." />
                <p className="px-1 pt-2 text-[16px] text-ink-2">
                  {live ? <>Want to see it act? <a href="/#save" className={LINK}>Watch a real save, replayed</a>, or </> : !demo.open ? <><button type="button" onClick={() => demo.setOpen(true)} className={LINK}>Show the push button</button>, or </> : <>Got a wallet? </>}
                  <button type="button" onClick={() => go("mine")} className={LINK}>{!live && demo.open ? "Protect your own loan" : "protect your own loan"}</button>.
                </p>
              </>
            )}

            {screen === "mine" && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-2 pt-3 sm:pt-6">
                  <h1 className="display max-w-[18ch] text-[clamp(2rem,4.4vw,3.2rem)] text-ink">Protect <span className="accent">your own loan.</span></h1>
                  <span className="pb-1"><ModeBadge status={status} /></span>
                </div>
                <Wizard wallet={wallet} status={status} />
                {W && own && (
                  <section ref={ownRef} aria-labelledby="own-loan" className="grid scroll-mt-24 gap-3 pt-8">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-1">
                      <h2 id="own-loan" className="display text-[clamp(1.7rem,3.4vw,2.4rem)] text-ink">{mine ? "Your loan" : `The loan of ${short(W.address)}`}</h2>
                      <p className="text-[15px] text-ink-2" role="status">{W.protectedHere || W.reading?.protected ? "Airbag is protecting it." : "Not protected yet."}</p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <NumberCard status={status} reading={own.reading} samples={own.samples} justNow={recentMove(ownActions, status.now)} lastSave={freshSave(ownActions, status.now)} />
                      <PriceCard status={status} reading={own.reading} samples={own.samples} />
                    </div>
                    <Facts reading={own.reading} />
                    <Moves log={ownLog} empty="Nothing yet for this loan." />
                  </section>
                )}
              </>
            )}
          </main>
        ) : (
          <main className="py-24 text-center text-ink-2" role="status">{error ? `Cannot reach the server (${error}). Retrying…` : "Loading…"}</main>
        )}

        <SiteFooter status={status} />
      </div>
    </>
  );
}
