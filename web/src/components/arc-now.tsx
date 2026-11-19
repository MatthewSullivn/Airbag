// "On Arc, right now": where a loan's money is, read from the chain. The dollars borrowed, the bitcoin locked,
// the health, the savings ready and the savings already moved into the loan, and (for a connected wallet) what
// is left in the wallet. Above them Arc's newest block, counted live, and when the loan was last read. With
// them the guard that limits what Airbag may do, and what a QuickNode Stream saw this loan do.
// One component, two shapes, chosen by its own width: a row of figures when it is wide, a list when it is narrow
// (beside the charts, or on a phone).
import type { Reading, Status, StreamEvent } from "@/lib/api";
import { useArcBlock } from "@/lib/arc-live";
import { ago, btc, clock, usdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Count, ExplorerLink, Panel } from "./bits";

const dollars = (v: number) => "$" + usdc(v);
const whole = (v: number) => Math.round(v).toLocaleString("en-US");
const DID: Record<string, string> = { borrow: "borrowed more", repay: "paid back", "collateral in": "bitcoin added", "collateral out": "bitcoin taken out", liquidation: "sold off", "OUR LOAN LIQUIDATED": "sold off" };

export interface ArcGuard { address: string; capUsdc: number | null }

/** The guard Airbag acts through, and what the QuickNode Stream saw this loan do. Words with links, no figures. */
export function ArcNotes({ status, guard, stream, mine, max = 3, className }: {
  status: Status;
  guard?: ArcGuard | null;
  /** What the QuickNode Stream reported about this loan, newest first. */
  stream?: StreamEvent[];
  mine?: boolean;
  max?: number;
  className?: string;
}) {
  const seen = (stream ?? []).slice(0, max);
  if (!status.explorer || (!guard && !seen.length)) return null;
  return (
    <div className={cn("space-y-1.5 text-[13.5px] leading-snug text-on-panel-faint", className)}>
      {guard && (
        <p>
          Airbag acts only through {mine ? "your" : "this loan's"} guard <ExplorerLink explorer={status.explorer} kind="address" id={guard.address} className="text-on-panel-2" />
          {guard.capUsdc != null ? <>: savings into the loan and back, at most {whole(guard.capUsdc)} USDC a day.</> : ": savings into the loan and back."}
        </p>
      )}
      {seen.length > 0 && (
        <p>
          Seen on Arc by QuickNode's Stream:{" "}
          {seen.map((e, i) => {
            const what = e.kind.replace(/^[^:]+: /, "");
            return (
              <span key={`${e.t}-${i}`}>
                {i > 0 && " · "}
                {clock(e.t)} {DID[what] ?? what}
                {e.tx && <> <ExplorerLink explorer={status.explorer} kind="tx" id={e.tx} className="text-on-panel-2">see it</ExplorerLink></>}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

export function ArcNow({ status, reading, wallet, guard, stream, mine, tight, className }: {
  status: Status;
  reading: Reading | null;
  /** The owner's wallet: its address, and (for a connected wallet) the dollars left in it. */
  wallet?: { address: string; usdc?: number | null } | null;
  /** The guard Airbag acts through for this loan, if any. */
  guard?: ArcGuard | null;
  /** What the QuickNode Stream reported about this loan, newest first. */
  stream?: StreamEvent[];
  /** Say "your". */
  mine?: boolean;
  /** It stands beside the charts: less padding, only the figures. The notes then go elsewhere (ArcNotes). */
  tight?: boolean;
  className?: string;
}) {
  const live = status.mode === "live";
  const block = useArcBlock(live);
  const r = reading;
  if (!r) return null;
  const apy = r.savings?.apy;
  const onChain = r.loan.healthFactor;
  const twoHealths = r.priceSource === "real" && onChain != null && Math.abs(onChain - r.health) > 0.005;
  // unit: said right after the figure. note: one more fact, when there is one worth the room.
  const cells: { label: string; value: number | null | undefined; format: (v: number) => string; unit: string; note?: string; hot?: boolean }[] = [
    { label: "Borrowed", value: r.loan.debt, format: dollars, unit: "USDC" },
    { label: "Bitcoin locked", value: r.loan.collateral, format: btc, unit: "cirBTC" },
    {
      label: "Health",
      value: r.health,
      format: (v) => v.toFixed(2),
      unit: "",
      note: twoHealths ? `at bitcoin's real price. ${onChain.toFixed(2)} at Arc's test price` : `Airbag acts under ${status.rule.actBelowHealth.toFixed(2)}`,
      hot: r.health < status.rule.actBelowHealth,
    },
    { label: "Savings, ready", value: r.savings?.balance, format: dollars, unit: "USDC", note: apy != null && apy > 0 ? `earning ${+(apy * 100).toFixed(1)}% a year` : undefined },
    { label: "Savings in the loan", value: r.inLoan, format: dollars, unit: "USDC", note: !tight && r.inLoan > 0.005 ? "back when it is calm" : undefined },
  ];
  if (wallet?.usdc != null) cells.push({ label: mine ? "In your wallet" : "In the wallet", value: wallet.usdc, format: dollars, unit: "USDC", note: tight ? undefined : "also pays the fees" });
  else if (!tight) cells.push({ label: "Moved in 24 hours", value: status.movedLast24h, format: dollars, unit: "USDC", note: `of ${whole(guard?.capUsdc ?? status.dailyCapUsdc)} allowed` });

  return (
    <Panel className={cn("@container", tight && "sm:p-6", className)} aria-label={live ? "On Arc, right now" : "The simulated loan, right now"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <p className="text-[16px] font-medium text-on-panel-2">{live ? "On Arc, right now" : "The loan, right now"}</p>
        {live ? (
          <span className="inline-flex items-center gap-2 text-[13.5px] text-on-panel-faint" role="status">
            <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
              {block && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />}
              <span className={cn("relative inline-flex size-2.5 rounded-full", block ? "bg-good" : "bg-on-panel-faint")} />
            </span>
            {block ? <span>block <Count value={block.number} format={whole} className="tabular-nums text-on-panel-2" /> · read {ago(r.at, status.now)}</span> : <span>Arc Testnet · read {ago(r.at, status.now)}</span>}
          </span>
        ) : (
          <span className="text-[13.5px] text-on-panel-faint">simulated, not on Arc</span>
        )}
      </div>

      {/* wide: figures in a row. Narrow (beside the charts, or on a phone): a list, label left and figure right. */}
      <dl className="mt-3.5 grid grid-cols-1 @2xl:mt-6 @2xl:grid-cols-3 @2xl:gap-x-7 @2xl:gap-y-6 @5xl:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-t border-panel-line py-2 first:border-t-0 @2xl:block @2xl:border-t-0 @2xl:py-0">
            <dt className="text-[14.5px] text-on-panel-2">{c.label}</dt>
            <dd className={cn("figure text-[1.6rem] @2xl:mt-2 @2xl:text-[2.3rem]", c.hot ? "text-[#ff6b5e]" : "text-on-panel")}>
              <Count value={c.value} format={c.format} />
              {c.unit === "cirBTC" && <span className="ml-1.5 font-sans text-[12px] font-normal tracking-normal text-on-panel-faint @2xl:hidden">cirBTC</span>}
            </dd>
            {/* wide: the unit and the note under the figure. Narrow: only the note, under the label. */}
            <dd className={cn("col-span-2 text-[12.5px] leading-snug text-on-panel-faint @2xl:mt-1.5", !c.note && "hidden @2xl:block")}>
              <span className="hidden @2xl:inline">{c.unit}{c.unit && c.note ? ", " : ""}</span>{c.note}
            </dd>
          </div>
        ))}
      </dl>

      {!tight && (
        <ArcNotes status={status} guard={guard} stream={stream} mine={mine} className="mt-4 border-t border-panel-line pt-3.5" />
      )}
    </Panel>
  );
}
