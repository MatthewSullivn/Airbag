// The app. Four screens, one idea each: the loan, the market, the chain, and trying it yourself.
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Wallet } from "lucide-react";
import { useLadders, useStatus } from "@/lib/api";
import { short } from "@/lib/format";
import { useWallet } from "@/wallet/use-wallet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button, Wordmark } from "@/components/bits";
import { Costs, Deeds, StreamList } from "@/components/chain-parts";
import { DemoDrawer, useDemoDrawer } from "@/components/demo-drawer";
import { LadderCard } from "@/components/ladder-card";
import { Facts, Moves } from "@/components/loan-parts";
import { OddsHistory } from "@/components/market-parts";
import { NumberCard } from "@/components/number-card";
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
  const wallet = useWallet();
  const demo = useDemoDrawer(status);
  const [tab, setTab] = useState(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (next: string) => {
    setTab(next);
    history.replaceState(null, "", `${location.pathname}${location.search}${next === "loan" ? "" : `#${next}`}`);
  };

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

  const theirs = status?.mode === "live" ? "the bot's own loan" : "the demo loan";
  const mine = wallet.how === "connected";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="/" className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
          <ModeBadge status={status} />
        </div>
        <nav aria-label="Screens">
          <SegmentedControl aria-label="Screen" value={tab} onValueChange={go} options={TABS} size="md" className="border-line bg-ink/5" pillColor="var(--paper)" />
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {status?.mode === "sim" && (
            <Button variant="outline" size="sm" onClick={() => demo.setOpen(true)}><FlaskConical aria-hidden="true" className="size-4" /> Try the demo</Button>
          )}
          <Button variant="ink" size="sm" onClick={() => { go("try"); if (!wallet.address) wallet.connect(); }}>
            <Wallet aria-hidden="true" className="size-4" /> {wallet.canSign && wallet.address ? short(wallet.address) : "Connect wallet"}
          </Button>
        </div>
      </header>

      {status ? (
        <main className="grid gap-3 pb-14">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-1 text-[15px] text-ink-2">
            <BotBadge status={status} error={error} />
            {W && !W.protectedHere && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2" role="status">
                {focus ? <>Showing {mine ? "your loan" : `the loan of ${short(W.address)}`}. {W.reading?.protected ? "Airbag is protecting it." : "Not protected yet."}</> : W.reading ? <>Showing {theirs}.</> : <>Showing {theirs}. {mine ? "Yours shows up once you open one." : "That wallet has no loan."}</>}
                {W.reading && <button type="button" onClick={() => setFollow((f) => !f)} className="font-semibold text-ink underline decoration-current/30 underline-offset-[3px] hover:decoration-current">{focus ? `Show ${theirs}` : mine ? "Show mine" : "Show that wallet's"}</button>}
              </p>
            )}
          </div>

          {tab === "loan" && (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                <NumberCard
                  status={status}
                  reading={reading}
                  samples={samples}
                  footer={<button type="button" onClick={() => go("market")} className="underline decoration-on-panel-faint/60 underline-offset-[3px] hover:decoration-on-panel">Where does this number come from?</button>}
                />
                <PriceCard status={status} reading={reading} samples={samples} />
              </div>
              <Facts reading={reading} />
              <Moves log={log} empty={focus ? "Nothing yet for this loan." : "Nothing yet. It is watching."} />
            </>
          )}

          {tab === "market" && (
            <>
              <h1 className="display max-w-[20ch] pb-4 pt-6 text-[clamp(2rem,4.6vw,3.2rem)] text-ink">The number comes from a real market.</h1>
              <LadderCard ladders={ladders} reading={reading} />
              <OddsHistory samples={samples} actions={actions} limit={status.limit} ofWallet={!!focus} />
            </>
          )}

          {tab === "chain" && (
            <>
              <h1 className="display max-w-[20ch] pb-4 pt-6 text-[clamp(2rem,4.6vw,3.2rem)] text-ink">Everything happens on Arc. Open any of it.</h1>
              <Deeds status={status} />
              <div className="px-1 py-8"><Costs /></div>
              <StreamList status={status} />
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

      <SiteFooter status={status} onDemo={() => demo.setOpen(true)} />
      {status && <DemoDrawer status={status} open={demo.open} onClose={() => demo.setOpen(false)} onActs={() => { setFollow(false); go("loan"); }} />}
    </div>
  );
}
