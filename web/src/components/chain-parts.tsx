// The On-chain screen: how the money moves between the contracts (a picture, every box a link to Arc's explorer),
// what a QuickNode Stream saw on Arc, and what a move costs.
import { ArrowDown, ArrowLeftRight, ArrowUpDown, ArrowUpRight } from "lucide-react";
import type { GasPrices, Status } from "@/lib/api";
import { ADDRESSES, EXPLORER, GAS, STREAM_RUN, TESTNET_GAS_PRICE_WEI } from "@/recorded/proof";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, ExplorerLink, Panel } from "./bits";

function Box({ title, what, address, className }: { title: string; what: string; address: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-panel-line bg-panel-2 p-4 sm:p-5", className)}>
      <p className="text-[1.15rem] font-semibold tracking-tight text-on-panel">{title}</p>
      <p className="mt-1 text-[14.5px] leading-snug text-on-panel-2">{what}</p>
      <p className="mt-3 text-[14.5px] text-on-panel"><ExplorerLink explorer={EXPLORER} kind="address" id={address} /></p>
    </div>
  );
}
function Flow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-1 text-[13px] text-on-panel-faint">
      <ArrowLeftRight aria-hidden="true" className="size-5 text-on-panel-2" />
      {label}
    </div>
  );
}

/** Where the money sits and who may move it. The bot's key reaches the savings and the loan only through the guard. */
export function MoneyMap({ status }: { status: Status | null }) {
  const live = status?.mode === "live";
  const guard = (live && status?.custody?.guard) || ADDRESSES.guard;
  const botKey = (live && (status?.custody?.botKeyAddress ?? status?.protector?.botAddress)) || ADDRESSES.botKey;
  const bot = <Box title="The bot's key" what="It can press two buttons on the guard: save, and give back. Nothing else." address={botKey} className="border-dashed bg-transparent" />;
  const presses = (
    <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-on-panel-faint">
      <ArrowDown aria-hidden="true" className="size-5 text-on-panel-2" /> presses
    </div>
  );
  const savings = (c?: string) => <Box title="The savings" what="Circle's Earn Kit vault. The owner's dollars wait here, earning interest." address={ADDRESSES.vault} className={c} />;
  const theGuard = (c?: string) => <Box title="The guard" what="AirbagGuard, our contract. Each wallet gets its own, and can switch it off." address={guard} className={cn("border-brand/60", c)} />;
  const loan = (c?: string) => <Box title="The loan" what="Morpho Blue, through Circle's Borrow Kit. The bitcoin is locked here." address={ADDRESSES.morpho} className={c} />;
  return (
    <Panel aria-label="How the money moves on Arc">
      {/* wide: the key above the guard, the guard between the savings and the loan */}
      <div className="hidden gap-x-3 gap-y-1 md:grid md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        <div className="col-start-3 row-start-1">{bot}{presses}</div>
        {savings("col-start-1 row-start-2")}
        <div className="col-start-2 row-start-2 self-center"><Flow label="USDC" /></div>
        {theGuard("col-start-3 row-start-2")}
        <div className="col-start-4 row-start-2 self-center"><Flow label="USDC" /></div>
        {loan("col-start-5 row-start-2")}
      </div>
      {/* phone: the same picture top to bottom. The key presses the guard, the guard moves dollars between the two. */}
      <div className="md:hidden">
        {bot}
        {presses}
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

/** On-chain events a QuickNode Stream pushed to the bot. Each one was checked against Arc before it was kept. */
export function StreamList({ status }: { status: Status }) {
  const live = status.stream.length > 0;
  return (
    <Card className="flex flex-col">
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">Seen on Arc, as it happened</h2>
      <p className="mt-1 text-[15px] text-ink-2">A QuickNode Stream tells the bot the moment the loan or the wallet moves.</p>
      {live ? (
        <ol className="mt-3 max-h-[22rem] overflow-y-auto">
          {status.stream.map((e, i) => (
            <li key={`${e.t}-${i}`} className="grid grid-cols-[5rem_1fr] gap-3 border-t border-line py-3.5 first:border-t-0">
              <time dateTime={new Date(e.t).toISOString()} className="mono pt-0.5 text-faint">{clock(e.t)}</time>
              <p className="min-w-0 leading-snug text-ink-2">
                <span className="font-medium text-ink">{e.kind}</span>
                {e.block != null ? `, block ${e.block}` : ""}
                {e.detail ? `. ${e.detail}` : ""}
                {e.tx && status.explorer ? (
                  <a href={`${status.explorer}/tx/${e.tx}`} target="_blank" rel="noopener" className="ml-2 inline-flex items-center gap-0.5 underline decoration-current/30 underline-offset-[3px] hover:decoration-current">
                    see it<ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                ) : null}
              </p>
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
