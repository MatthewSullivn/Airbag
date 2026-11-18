// The app. Four screens, one idea each: the loan, the market, the chain, and trying it yourself.
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Wallet } from "lucide-react";
import { useGasPrices, useLadders, useMarketHistory, useStatus } from "@/lib/api";
import { short } from "@/lib/format";
import { useWallet } from "@/wallet/use-wallet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button, Wordmark } from "@/components/bits";
import { Costs, MoneyMap, StreamList } from "@/components/chain-parts";
import { DemoDrawer, useDemoDrawer } from "@/components/demo-drawer";
import { HedgeCard } from "@/components/hedge-card";
import { LadderCard } from "@/components/ladder-card";
import { Facts, Moves } from "@/components/loan-parts";
import { OverTime } from "@/components/market-parts";
import { NumberCard, recentMove } from "@/components/number-card";
import { PriceCard } from "@/components/price-card";
import { SiteFooter } from "@/components/site-footer";
import { BotBadge, ModeBadge } from "@/components/top-bar";
import { Wizard } from "@/components/wizard";

const TABS = [
  { value: "loan", label: "Loan" },
  { value: "market", label: "Market" },
  { value: "chain", label: "On-chain" },
  { value: "try", label: "Try it" },
];
const tabFromHash = () => {
  const h = location.hash.replace("#", "");
  return TABS.some((t) => t.value === h) ? h : "loan";
};

export function Dashboard() {
  const { data: status, error } = useStatus();
  const { data: ladders } = useLadders();
  const { data: gas } = useGasPrices();
  const wallet = useWallet();
  const demo = useDemoDrawer(status);
  const [tab, setTab] = useState(tabFromHash);
  // Gemini's own history for the ladder the number comes from (the Market screen's "over time" picture)
  const historyTicker = tab === "market" ? status?.reading?.odds?.ticker ?? ladders?.events[0]?.ticker ?? null : null;
  const { data: historyData } = useMarketHistory(historyTicker);
  const marketHistory = historyData && historyData.ticker === historyTicker ? historyData : null;
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (next: string) => {
    setTab(next);
    history.replaceState(null, "", `${location.pathname}${location.search}${next === "loan" ? "" : `#${next}`}`);
  };

  // 1 to 4 switch screens: handy on stage, where hunting for a tab with the mouse costs seconds
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const next = TABS[Number(e.key) - 1];
      if (next) go(next.value);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // go only touches state setters and the address bar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A connected (or looked-up) wallet with a loan: the screens show THAT loan, not the bot's own.
  const [follow, setFollow] = useState(true);
  useEffect(() => { setFollow(true); }, [wallet.address, wallet.acted]);
  const W = wallet.view;
  const focus = follow && W?.reading && !W.protectedHere ? W : null;
  const who = focus ? focus.address.toLowerCase() : null;
  const reading = focus ? focus.reading : status?.reading ?? null;
  const samples = focus ? wallet.samples : status?.samples ?? [];
  const log = useMemo(() => (status ? (who ? status.log.filter((e) => e.who === who) : status.log) : []), [status, who]);
  const actions = useMemo(() => log.filter((e) => e.level === "action" && (who ? true : !e.who)), [log, who]);

  // After "Push it to the edge" or "Calm it down" on the Try it screen, show the loan itself:
  // that is where the number turns red and Airbag answers, and nobody should have to click to see it.
  const lastStep = wallet.steps[wallet.steps.length - 1];
  useEffect(() => {
    if (lastStep?.state === "done" && /^(Pushed|Calmer)\./.test(lastStep.text)) go("loan");
    // only when a new line arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastStep?.id]);

  const theirs = status?.mode === "live" ? "the bot's own loan" : "the demo loan";
  const mine = wallet.how === "connected";

  // A demo button was pressed: say so on the big number at once (the chain takes a few seconds to answer),
  // and bring the number into view. Cleared when the loan's line has moved, or after 15 s.
  const [pressed, setPressed] = useState<{ kind: "push" | "reset"; at: number; line: number | null } | null>(null);
  const lineNow = status?.reading?.line ?? null;
  useEffect(() => {
    if (!pressed) return;
    if (lineNow != null && pressed.line != null && Math.abs(lineNow - pressed.line) > 1) { setPressed(null); return; }
    const t = setTimeout(() => setPressed(null), Math.max(0, 15_000 - (Date.now() - pressed.at)));
    return () => clearTimeout(t);
  }, [pressed, lineNow]);
  const pending = pressed && !focus ? (pressed.kind === "push" ? "Pushing the loan…" : "Resetting…") : null;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
      {/* On a phone: the name and the buttons share one row, the screens get the next, so the loan starts high up. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-4 py-5 sm:gap-x-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="/" className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
          <span className="hidden sm:inline-flex"><ModeBadge status={status} /></span>
        </div>
        <nav aria-label="Screens" className="order-3 w-full lg:order-none lg:w-auto">
          <SegmentedControl aria-label="Screen" value={tab} onValueChange={go} options={TABS} size="md" className="border-line bg-ink/5" pillColor="var(--paper)" />
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {status?.mode === "sim" && (
            <Button variant="outline" size="sm" className="px-3 sm:px-4" onClick={() => demo.setOpen(true)}>
              <FlaskConical aria-hidden="true" className="size-4" /> <span className="sm:hidden">Demo</span><span className="hidden sm:inline">Try the demo</span>
            </Button>
          )}
          <Button variant="ink" size="sm" className="px-3 sm:px-4" onClick={() => { go("try"); if (!wallet.address) wallet.connect(); }}>
            <Wallet aria-hidden="true" className="size-4" />{" "}
            {wallet.canSign && wallet.address ? short(wallet.address) : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></>}
          </Button>
        </div>
      </header>

      {status ? (
        <main className={`grid gap-3 ${demo.open ? "pb-36" : "pb-14"}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-1 text-[15px] text-ink-2">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="sm:hidden"><ModeBadge status={status} /></span>
              <BotBadge status={status} error={error} />
            </span>
            {W && !W.protectedHere && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2" role="status">
                {focus ? <>Showing {mine ? "your loan" : `the loan of ${short(W.address)}`}. {W.reading?.protected ? "Airbag is protecting it." : "Not protected yet."}</> : W.reading ? <>Showing {theirs}.</> : <>Showing {theirs}. {mine ? "Yours shows up once you open one." : "That wallet has no loan."}</>}
                {W.reading && <button type="button" onClick={() => setFollow((f) => !f)} className="font-semibold text-ink underline decoration-current/30 underline-offset-[3px] hover:decoration-current">{focus ? `Show ${theirs}` : mine ? "Show mine" : "Show that wallet's"}</button>}
              </p>
            )}
          </div>

          {tab === "loan" && (
            <>
              <h1 className="sr-only">The loan</h1>
              <div className="grid gap-3 lg:grid-cols-2">
                <NumberCard
                  status={status}
                  reading={reading}
                  samples={samples}
                  pending={pending}
                  justNow={recentMove(actions, status.now)}
                  footer={<button type="button" onClick={() => go("market")} className="underline decoration-on-panel-faint/60 underline-offset-[3px] hover:decoration-on-panel">Where does this number come from?</button>}
                />
                <PriceCard status={status} reading={reading} samples={samples} />
              </div>
              <Facts reading={reading} />
              <Moves log={log} empty={focus ? "Nothing yet for this loan." : "Nothing yet. It is watching."} />
              <p className="px-1 pt-2 text-[16px] text-ink-2">
                Want to see it act? <a href="/#save" className="font-semibold text-ink underline decoration-current/30 underline-offset-[3px] hover:decoration-current">Watch a real save, replayed</a>
                {status.mode === "sim" ? <>, or <button type="button" onClick={() => demo.setOpen(true)} className="font-semibold text-ink underline decoration-current/30 underline-offset-[3px] hover:decoration-current">push this demo loan yourself</button>.</> : <>, or <button type="button" onClick={() => go("try")} className="font-semibold text-ink underline decoration-current/30 underline-offset-[3px] hover:decoration-current">try it with your own wallet</button>.</>}
              </p>
            </>
          )}

          {tab === "market" && (
            <>
              <h1 className="display max-w-[20ch] pb-4 pt-6 text-[clamp(2rem,4.6vw,3.2rem)] text-ink">The number comes from a real market.</h1>
              <LadderCard ladders={ladders} reading={reading} limit={status.limit} />
              <OverTime history={marketHistory} spot={reading?.priceUsed ?? ladders?.spot ?? null} samples={samples} actions={actions} limit={status.limit} ofWallet={!!focus} />
              <HedgeCard ladders={ladders} reading={reading} lltv={status.lltv} />
            </>
          )}

          {tab === "chain" && (
            <>
              <h1 className="display max-w-[20ch] pt-6 text-[clamp(2rem,4.6vw,3.2rem)] text-ink">{status.mode === "live" ? "It all happens on Arc. Open any box." : "The real one runs on Arc. Open any box."}</h1>
              <p className="max-w-[60ch] pb-4 text-[16px] text-ink-2">
                {status.mode === "live" ? "Every box is a contract on Arc Testnet." : "These are the live bot's contracts on Arc Testnet, and what it really paid. Only the demo loan on this page is simulated."}
              </p>
              <MoneyMap status={status} />
              <div className="grid gap-3 lg:grid-cols-2">
                <StreamList status={status} />
                <Costs gas={gas} />
              </div>
            </>
          )}

          {tab === "try" && (
            <>
              <h1 className="display max-w-[20ch] pb-4 pt-6 text-[clamp(2rem,4.6vw,3.2rem)] text-ink">Try it with your own wallet.</h1>
              <Wizard wallet={wallet} status={status} />
            </>
          )}
        </main>
      ) : (
        <main className="py-24 text-center text-ink-2" role="status">{error ? `Cannot reach the server (${error}). Retrying…` : "Loading…"}</main>
      )}

      <SiteFooter status={status} />
      {status && (
        <DemoDrawer
          status={status}
          open={demo.open}
          onClose={() => demo.setOpen(false)}
          onActs={(kind) => {
            setFollow(false);
            go("loan");
            setPressed({ kind, at: Date.now(), line: status.reading?.line ?? null });
            scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
