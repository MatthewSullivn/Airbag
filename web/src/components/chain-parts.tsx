// The Arc part of the landing page: how the money moves between the contracts (a picture, every box a link to Arc's explorer),
// what a QuickNode Stream saw on Arc, and what a move costs.
import { useRef } from "react";
import { ArrowDown, ArrowUpDown, ArrowUpRight } from "lucide-react";
import type { GasPrices, Status } from "@/lib/api";
import { ADDRESSES, EXPLORER, GAS, STREAM_RUN, TESTNET_GAS_PRICE_WEI } from "@/recorded/proof";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, ExplorerLink, Panel } from "./bits";
import { AnimatedBeam } from "./ui/animated-beam";

function Box({ title, what, address, link, className, ref }: { title: string; what: string; address?: string; link?: { href: string; label: string } | null; className?: string; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cn("relative z-10 rounded-2xl border border-panel-line bg-panel-2 p-4 sm:p-5", className)}>
      <p className="text-[1.15rem] font-semibold tracking-tight text-on-panel">{title}</p>
      <p className="mt-1 text-[14.5px] leading-snug text-on-panel-2">{what}</p>
      {address && <p className="mt-3 text-[14.5px] text-on-panel"><ExplorerLink explorer={EXPLORER} kind="address" id={address} /></p>}
      {link && (
        <p className="mt-3 text-[14.5px] text-on-panel">
          <a href={link.href} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 underline decoration-current/30 underline-offset-[3px] hover:decoration-current">
            {link.label}<ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60" />
          </a>
        </p>
      )}
    </div>
  );
}
// The gap between two boxes. The line of light runs through its middle, so the word sits above it.
function Flow({ label }: { label: string }) {
  return <div className="w-20 pb-8 text-center text-[13px] text-on-panel-faint lg:w-28">{label}</div>;
}
function Down({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-on-panel-faint">
      <ArrowDown aria-hidden="true" className="size-5 text-on-panel-2" /> {label}
    </div>
  );
}
// one round every 8 seconds
const BEAM = { pathColor: "#6b6a64", pathOpacity: 0.6, pathWidth: 2, gradientStartColor: "#ffd2b8", gradientStopColor: "#f0591f", duration: 1.1, repeatDelay: 6.9 } as const;

/**
 * Who tells the bot, and where the money sits. Gemini's odds and QuickNode's wake-up call reach the bot. The bot's
 * key can only press the guard. The guard moves the owner's dollars between the savings and the loan.
 */
export function MoneyMap({ status, marketUrl }: { status: Status | null; marketUrl?: string | null }) {
  const live = status?.mode === "live";
  const guard = (live && status?.custody?.guard) || ADDRESSES.guard;
  const botKey = (live && (status?.custody?.botKeyAddress ?? status?.protector?.botAddress)) || ADDRESSES.botKey;
  const map = useRef<HTMLDivElement>(null);
  const geminiRef = useRef<HTMLDivElement>(null), streamRef = useRef<HTMLDivElement>(null), botRef = useRef<HTMLDivElement>(null);
  const savingsRef = useRef<HTMLDivElement>(null), guardRef = useRef<HTMLDivElement>(null), loanRef = useRef<HTMLDivElement>(null);
  type R = React.Ref<HTMLDivElement>;
  const gemini = (c?: string, ref?: R) => <Box ref={ref} title="Gemini" what="Its prediction market gives the odds. The bot reads them every few seconds." link={marketUrl ? { href: marketUrl, label: "the market" } : null} className={c} />;
  const stream = (c?: string, ref?: R) => <Box ref={ref} title="QuickNode" what="A Stream watches Arc and wakes the bot the moment the loan moves." className={c} />;
  const bot = (c?: string, ref?: R) => <Box ref={ref} title="The bot's key" what="It can press two buttons on the guard: save, and give back. Nothing else." address={botKey} className={cn("border-dashed bg-panel", c)} />;
  const savings = (c?: string, ref?: R) => <Box ref={ref} title="The savings" what="Circle's Earn Kit vault. The owner's dollars wait here, earning interest." address={ADDRESSES.vault} className={c} />;
  const theGuard = (c?: string, ref?: R) => <Box ref={ref} title="The guard" what="AirbagGuard, our contract. Each wallet gets its own, and can switch it off." address={guard} className={cn("border-brand/60", c)} />;
  const loan = (c?: string, ref?: R) => <Box ref={ref} title="The loan" what="Morpho Blue, through Circle's Borrow Kit. The bitcoin is locked here." address={ADDRESSES.morpho} className={c} />;
  return (
    <Panel aria-label="How the money moves on Arc">
      {/* wide: Gemini and QuickNode either side of the key, the key above the guard, the guard between the savings
          and the loan. Light travels along the wires: the two signals in, the key pressing down, then dollars from
          the savings through the guard into the loan (a save), and later the way back (a give-back). */}
      <div ref={map} className="relative hidden gap-x-0 md:grid md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {gemini("col-start-1 row-start-1", geminiRef)}
        <div className="col-start-2 row-start-1 self-center"><Flow label="odds" /></div>
        {bot("col-start-3 row-start-1", botRef)}
        <div className="col-start-4 row-start-1 self-center"><Flow label="wake-up" /></div>
        {stream("col-start-5 row-start-1", streamRef)}
        <div className="relative col-start-3 row-start-2 h-10"><span className="absolute left-1/2 top-1/2 -translate-y-1/2 pl-4 text-[13px] text-on-panel-faint">presses</span></div>
        {savings("col-start-1 row-start-3", savingsRef)}
        <div className="col-start-2 row-start-3 self-center"><Flow label="USDC" /></div>
        {theGuard("col-start-3 row-start-3", guardRef)}
        <div className="col-start-4 row-start-3 self-center"><Flow label="USDC" /></div>
        {loan("col-start-5 row-start-3", loanRef)}
        <AnimatedBeam containerRef={map} fromRef={geminiRef} toRef={botRef} delay={0} {...BEAM} />
        <AnimatedBeam containerRef={map} fromRef={streamRef} toRef={botRef} delay={0} {...BEAM} />
        <AnimatedBeam containerRef={map} fromRef={botRef} toRef={guardRef} vertical delay={0.9} {...BEAM} />
        <AnimatedBeam containerRef={map} fromRef={savingsRef} toRef={guardRef} delay={1.8} {...BEAM} />
        <AnimatedBeam containerRef={map} fromRef={guardRef} toRef={loanRef} delay={2.7} {...BEAM} />
        <AnimatedBeam containerRef={map} fromRef={botRef} toRef={guardRef} vertical delay={4.5} {...BEAM} pathOpacity={0} />
        <AnimatedBeam containerRef={map} fromRef={guardRef} toRef={loanRef} reverse delay={5.4} {...BEAM} pathOpacity={0} />
        <AnimatedBeam containerRef={map} fromRef={savingsRef} toRef={guardRef} reverse delay={6.3} {...BEAM} pathOpacity={0} />
      </div>
      {/* phone: the same picture top to bottom */}
      <div className="md:hidden">
        <div className="grid grid-cols-2 gap-2">
          {gemini()}
          {stream()}
        </div>
        <Down label="tell the bot" />
        {bot()}
        <Down label="presses" />
        {theGuard()}
        <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-on-panel-faint">
          <ArrowUpDown aria-hidden="true" className="size-5 text-on-panel-2" /> moves USDC between
        </div>
        <div className="grid grid-cols-2 gap-2">
          {savings()}
          {loan()}
        </div>
      </div>
      <p className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-panel-line pt-4 text-[14.5px] text-on-panel-2">
        <span>The dollars: USDC <ExplorerLink explorer={EXPLORER} kind="address" id={ADDRESSES.usdc} />. On Arc it also pays the fees.</span>
        <span>The bitcoin: cirBTC <ExplorerLink explorer={EXPLORER} kind="address" id={ADDRESSES.cirbtc} /></span>
      </p>
    </Panel>
  );
}

/**
 * What it costs. The big figures are what our transactions really paid on Arc Testnet. The line under them is
 * the mainnet estimate: the same gas, times Arc mainnet's gas price read live a moment ago (/api/gas).
 */
export function Costs({ gas }: { gas: GasPrices | null }) {
  const fee = (units: number, priceWei: number) => (units * priceWei) / 1e18;
  const rows = [
    { what: "to switch protection on, once", units: GAS.createGuard.gas + GAS.savingsPermission.gas + GAS.loanPermission.gas, tx: GAS.createGuard.tx, digits: 3 },
    { what: "each time Airbag saves the loan", units: GAS.save.gas, tx: GAS.save.tx, digits: 4 },
    { what: "each time it gives the savings back", units: GAS.giveBack.gas, tx: GAS.giveBack.tx, digits: 4 },
  ];
  const main = gas?.mainnet ? Number(gas.mainnet.gasPriceWei) : null;
  const same = main === TESTNET_GAS_PRICE_WEI;
  return (
    <Card className="flex flex-col">
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">What it costs</h2>
      <p className="mt-1 text-[15px] text-ink-2">Fees on Arc are paid in dollars (USDC). These were really paid.</p>
      <dl className="mt-3">
        {rows.map((r) => (
          <div key={r.what} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-t border-line py-3.5 first:border-t-0 sm:flex">
            <dd className="order-1 shrink-0">
              <span className="figure text-[2.6rem] text-ink">${fee(r.units, TESTNET_GAS_PRICE_WEI).toFixed(r.digits)}</span>
            </dd>
            <dt className="order-3 col-span-2 min-w-0 text-[16px] leading-snug text-ink-2 sm:order-2 sm:flex-1">
              {r.what}
              {main != null && !same ? <span className="block text-[14px] text-faint">on mainnet today: about ${fee(r.units, main).toFixed(r.digits)}</span> : null}
            </dt>
            <dd className="order-2 text-[14.5px] text-ink-2 sm:order-3"><ExplorerLink explorer={EXPLORER} kind="tx" id={r.tx}>see it</ExplorerLink></dd>
          </div>
        ))}
      </dl>
      {main != null && (
        <p className="mt-auto border-t border-line pt-4 text-[15px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{same ? "On Arc mainnet it would cost the same today." : "On Arc mainnet today: the grey figures."}</span>{" "}
          Estimated from mainnet's gas price, read live ({main / 1e9} gwei).
        </p>
      )}
    </Card>
  );
}

// The server's labels for a delivery, in plain words. "our loan" is the loan this server's own bot guards.
const WHOSE: Record<string, string> = { "our loan": "The loan Airbag guards", "connected wallet": "A connected wallet's loan" };
const DID: Record<string, string> = {
  borrow: "borrowed more",
  repay: "paid back",
  "collateral in": "bitcoin added",
  "collateral out": "bitcoin taken out",
  liquidation: "sold off",
  "OUR LOAN LIQUIDATED": "sold off",
};
function plain(kind: string): string {
  const m = kind.match(/^(our loan|connected wallet): (.+)$/);
  if (m) return `${WHOSE[m[1]]}: ${DID[m[2]] ?? m[2]}`;
  if (kind === "bot wallet transaction") return "The bot's wallet sent a transaction";
  if (kind === "savings deposit") return "Savings went in";
  if (kind === "savings withdraw") return "Savings came out";
  return kind;
}

/** On-chain events a QuickNode Stream pushed to the bot. Each one was checked against Arc before it was kept. */
export function StreamList({ status }: { status: Status }) {
  // other people's loans in the same market are not listed: the bot ignores them, and they would bury our rows
  const rows = status.stream.filter((e) => !e.kind.startsWith("market: "));
  const live = rows.length > 0;
  const others = status.streamOthers && status.streamOthers.count > 0 ? status.streamOthers : null;
  // proof that the Stream is connected right now, even when none of the guarded loans has moved
  const connected = others && (
    <p className="mt-3 flex items-start gap-2.5 text-[15px] leading-snug text-ink-2">
      <span aria-hidden="true" className="mt-[0.45em] size-2 shrink-0 rounded-full bg-good" />
      <span>
        <span className="font-semibold text-ink">The Stream is connected.</span> Since {clock(others.since)} it has reported {others.count.toLocaleString("en-US")} {others.count === 1 ? "move" : "moves"} of other people's loans in this market. Airbag ignores those.
      </span>
    </p>
  );
  return (
    <Card className="flex flex-col">
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">Seen on Arc, as it happened</h2>
      <p className="mt-1 text-[15px] text-ink-2">A QuickNode Stream tells the bot the moment a loan it guards moves.</p>
      {connected}
      {live ? (
        <ol className="mt-3 max-h-[22rem] overflow-y-auto">
          {rows.map((e, i) => (
            <li key={`${e.t}-${i}`} className="grid grid-cols-[5rem_1fr_auto] items-baseline gap-3 border-t border-line py-3.5 first:border-t-0">
              <time dateTime={new Date(e.t).toISOString()} className="mono text-faint">{clock(e.t)}</time>
              <p className="min-w-0 leading-snug">
                <span className="font-medium text-ink">{plain(e.kind)}</span>
                {e.block != null && <span className="block text-[14px] text-faint">block {e.block.toLocaleString("en-US")}</span>}
              </p>
              {e.tx && status.explorer ? <span className="text-[14.5px] text-ink-2"><ExplorerLink explorer={status.explorer} kind="tx" id={e.tx}>see it</ExplorerLink></span> : <span />}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ol className="mt-3">
            {STREAM_RUN.deliveries.map((d) => (
              <li key={d.tx} className="grid grid-cols-[5rem_1fr_auto] items-baseline gap-3 border-t border-line py-3.5 first:border-t-0">
                <span className="mono text-faint">{d.utc}</span>
                <p className="min-w-0 leading-snug">
                  <span className="font-medium text-ink">{d.what}</span>
                  <span className="block text-[14px] text-faint">block {d.block.toLocaleString("en-US")}</span>
                </p>
                <span className="text-[14.5px] text-ink-2"><ExplorerLink explorer={EXPLORER} kind="tx" id={d.tx}>see it</ExplorerLink></span>
              </li>
            ))}
          </ol>
          <p className="mt-auto border-t border-line pt-4 text-[15px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">Recorded {STREAM_RUN.date}, times in UTC.</span> The Stream delivered each of these as it happened. The server checked it against Arc, then woke the bot.
          </p>
        </>
      )}
    </Card>
  );
}
