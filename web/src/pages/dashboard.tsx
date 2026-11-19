// The app. Two screens: the live demo (a loan Airbag is guarding right now) and my loan (do it with your own
// wallet). Under each loan, one strip shows how its number is being made right now from Gemini's live feed.
// The longer explanation, and what happens on Arc, are on the first page.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePressed } from "@/lib/use-pressed";
import { Wallet } from "lucide-react";
import { useLadders, useStatus } from "@/lib/api";
import { symbolsOf, useGeminiFeed } from "@/lib/gemini-feed";
import { short } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWallet } from "@/wallet/use-wallet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MetalButton, MetalLink, ShinyButton } from "@/components/ui/cta";
import { ArcNotes, ArcNow } from "@/components/arc-now";
import { Wordmark } from "@/components/bits";
import { DemoDrawer, useDemoDrawer } from "@/components/demo-drawer";
import { LoanCards } from "@/components/loan-cards";
import { Moves } from "@/components/loan-parts";
import { SiteFooter } from "@/components/site-footer";
import { BotBadge, ModeBadge } from "@/components/top-bar";
import { WalletLookup, Wizard } from "@/components/wizard";
import { WhatIf } from "@/components/what-if";

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
  // Gemini's market: the ladders the bot reads (every 20 s), and Gemini's own live feed for the same bets
  const { data: ladders } = useLadders();
  const feed = useGeminiFeed(symbolsOf(ladders));
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

  // Once a wallet's loan is on screen and nothing is left to set up (it is protected, or it is only being looked
  // at), the steps fold into a slim bar and the loan gets the whole screen: chance, price, money, and how the
  // number is made, without scrolling on a wide screen.
  const guarded = !!W && (W.protectedHere || !!W.reading?.protected || !!W.protection.guard);
  const cockpit = !!W && !!own && !!W.loan && (guarded || !wallet.canSign);
  // Airbag acts through this loan's own guard (the server's own guard for the loan the bot itself protects)
  const ownGuard = W?.protection.guard
    ? { address: W.protection.guard.address, capUsdc: W.protection.guard.capUsdc }
    : W?.protectedHere && status?.custody?.guard
      ? { address: status.custody.guard, capUsdc: status.custody.guardDailyCapUsdc }
      : null;
  // What the QuickNode Stream reported about this loan. A connected wallet's deliveries are not marked with the
  // wallet, so they are only shown when this is the one connected wallet the bot protects, or when the
  // transaction is one of this loan's own moves.
  const ownStream = useMemo(() => {
    if (!status || !W) return [];
    if (W.protectedHere) return status.stream.filter((e) => e.kind.startsWith("our loan: "));
    const loans = status.protector.loans;
    const only = loans.length === 1 && loans[0].owner.toLowerCase() === W.address.toLowerCase();
    const txs = new Set(ownLog.flatMap((e) => (e.txs ?? []).map((t) => t.hash?.toLowerCase())));
    return status.stream.filter((e) => e.kind.startsWith("connected wallet: ") && (only || (!!e.tx && txs.has(e.tx.toLowerCase()))));
  }, [status, W, ownLog]);

  // After "Push it to the edge" or "Calm it down", bring the wallet's own loan into view: that is where the
  // number turns red and Airbag answers, and nobody should have to hunt for it.
  const ownRef = useRef<HTMLElement>(null);
  const lastStep = wallet.steps[wallet.steps.length - 1];
  useEffect(() => {
    if (lastStep?.state !== "done" || !/^(Pushed|Calmer)\./.test(lastStep.text)) return;
    if (cockpit) scrollTo({ top: 0, behavior: "smooth" });            // the bar and the whole loan are one screen
    else ownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // only a newly finished step moves the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastStep?.id, lastStep?.state, lastStep?.text]);

  // A demo button was pressed: say so on the big number at once, and bring the number into view.
  const pressed = usePressed(status, botActions[0]?.t ?? null);

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
                    pressed.press(kind);
                    scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
                {/* The live loan is real: pushing it needs its owner's key, which this server does not hold. So the
                    page says so, and offers the three ways to see Airbag act. (The team's own controls: press d.) */}
                {live && !demo.open && (
                  <aside aria-label="See it act" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] border border-panel-line bg-panel px-5 py-3.5 text-on-panel shadow-xl">
                    <p className="min-w-0 flex-1 basis-72 text-[14.5px] leading-snug text-on-panel-2">
                      <span className="label mr-2.5 text-on-panel-faint">See it act</span>
                      This loan is real, so nobody can push it from this page.
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <ShinyButton small onClick={() => document.getElementById("what-if")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Push it on paper</ShinyButton>
                      <MetalLink small href="/#save">Watch a real save</MetalLink>
                      <MetalButton small onClick={() => go("mine")}>Push your own loan</MetalButton>
                    </div>
                  </aside>
                )}
                <LoanCards
                  status={status}
                  reading={status.reading}
                  samples={status.samples}
                  actions={botActions}
                  pending={pressed.pending}
                  footer={<a href="#made" onClick={(e) => { e.preventDefault(); document.getElementById("made")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="underline decoration-on-panel-faint/60 underline-offset-[3px] hover:decoration-on-panel">Where does this number come from?</a>}
                  made={{ ladders, feed, id: "made" }}
                />
                <ArcNow
                  status={status}
                  reading={status.reading}
                  guard={status.custody?.guard ? { address: status.custody.guard, capUsdc: status.custody.guardDailyCapUsdc } : null}
                  stream={status.stream.filter((e) => e.kind.startsWith("our loan: "))}
                />
                {live && <WhatIf id="what-if" status={status} reading={status.reading} ladders={ladders} feed={feed} />}
                <Moves log={botLog} empty="Nothing yet. It is watching." />
                {!live && (
                  <p className="px-1 pt-2 text-[16px] text-ink-2">
                    {!demo.open ? <><button type="button" onClick={() => demo.setOpen(true)} className={LINK}>Show the push button</button>, or </> : <>Got a wallet? </>}
                    <button type="button" onClick={() => go("mine")} className={LINK}>{demo.open ? "Protect your own loan" : "protect your own loan"}</button>.
                  </p>
                )}
              </>
            )}

            {screen === "mine" && (
              <>
                {/* with a loan on screen and nothing left to set up, the slim bar is the heading (components/wizard.tsx) */}
                {!cockpit && (
                  <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-2 pt-3 sm:pt-6">
                    <h1 className="display max-w-[18ch] text-[clamp(2rem,4.4vw,3.2rem)] text-ink">Protect <span className="accent">your own loan.</span></h1>
                    <span className="pb-1"><ModeBadge status={status} /></span>
                  </div>
                )}
                <Wizard wallet={wallet} status={status} compact={cockpit} />
                {W && own && (
                  <section ref={ownRef} aria-labelledby={cockpit ? undefined : "own-loan"} aria-label={cockpit ? "The loan" : undefined} className={cn("grid scroll-mt-24 gap-3", !cockpit && "pt-8")}>
                    {!cockpit && (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-1">
                        <h2 id="own-loan" className="display text-[clamp(1.7rem,3.4vw,2.4rem)] text-ink">{mine ? "Your loan" : `The loan of ${short(W.address)}`}</h2>
                        <p className="text-[15px] text-ink-2" role="status">{guarded ? "Airbag is protecting it." : "Not protected yet."}</p>
                      </div>
                    )}
                    {/* a new wallet starts with a clean chart. Beside the two charts: the money on Arc. Under them: how the number is made. */}
                    <LoanCards
                      key={who ?? "bot"}
                      status={status}
                      reading={own.reading}
                      samples={own.samples}
                      actions={ownActions}
                      made={{ ladders, feed }}
                      aside={<ArcNow tight status={status} reading={own.reading} wallet={{ address: W.address, usdc: W.usdc }} mine={mine} />}
                    />
                    {(ownGuard || ownStream.length > 0) && status.explorer && (
                      <div className="rounded-[22px] border border-panel-line bg-panel px-6 py-4">
                        <ArcNotes status={status} guard={ownGuard} stream={ownStream} mine={mine} max={4} />
                      </div>
                    )}
                    <Moves log={ownLog} empty="Nothing yet for this loan." />
                  </section>
                )}
                {cockpit && <WalletLookup wallet={wallet} />}
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
