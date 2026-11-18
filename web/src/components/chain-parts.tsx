// The On-chain screen: the contracts this runs on, what a move costs, and what a QuickNode Stream saw on Arc.
// Links you can open, not paragraphs.
import { ArrowUpRight } from "lucide-react";
import type { Status } from "@/lib/api";
import { ADDRESSES, EXPLORER } from "@/data/proof";
import { clock } from "@/lib/format";
import { Card, ExplorerLink } from "./bits";

export function Deeds({ status }: { status: Status | null }) {
  const live = status?.mode === "live";
  const guard = (live && status?.custody?.guard) || ADDRESSES.guard;
  const botKey = (live && (status?.custody?.botKeyAddress ?? status?.protector?.botAddress)) || ADDRESSES.botKey;
  const deeds: [string, string, string][] = [
    ["The loan", "Morpho Blue, through Circle's Borrow Kit", ADDRESSES.morpho],
    ["The savings", "Circle's Earn Kit vault", ADDRESSES.vault],
    ["The guard", "AirbagGuard, our own contract", guard],
    ["The bot", "Its own key. It holds none of yours.", botKey],
    ["The bitcoin", "cirBTC, Circle's bitcoin on Arc", ADDRESSES.cirbtc],
    ["The dollars", "USDC. On Arc it also pays the fees.", ADDRESSES.usdc],
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {deeds.map(([role, name, address]) => (
        <li key={role}>
          <Card className="h-full p-5 sm:p-6">
            <p className="text-[1.25rem] font-semibold tracking-tight text-ink">{role}</p>
            <p className="mt-1 text-[15px] leading-snug text-ink-2">{name}</p>
            <p className="mt-4 text-[15px] text-ink"><ExplorerLink explorer={EXPLORER} kind="address" id={address} /></p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function Costs() {
  return (
    <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
      {[
        ["0.0097", "USDC for a save. One transaction."],
        ["0.033", "USDC to create your own guard. Once."],
        ["3 s", "from the push to the save."],
      ].map(([big, small]) => (
        <div key={small}>
          <dd className="figure text-[4.2rem] text-ink">{big}</dd>
          <dt className="mt-2 max-w-[22ch] text-[16px] leading-snug text-ink-2">{small}</dt>
        </div>
      ))}
    </dl>
  );
}

/** On-chain events a QuickNode Stream pushed to the bot. Each one was checked against Arc before it was kept. */
export function StreamList({ status }: { status: Status }) {
  return (
    <Card>
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">Seen on Arc, as it happened</h2>
      <p className="mt-1 text-[15px] text-ink-2">A QuickNode Stream tells the bot the moment the loan or the wallet moves.</p>
      {status.stream.length ? (
        <ol className="mt-4 max-h-[22rem] overflow-y-auto">
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
        <p className="mt-4 text-ink-2">Nothing yet. Events show up here when the Stream is switched on.</p>
      )}
    </Card>
  );
}
