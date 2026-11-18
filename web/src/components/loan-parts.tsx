// The quiet parts of the Loan screen: four plain facts and the list of what Airbag did.
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { LogEntry, Reading } from "@/lib/api";
import { btc, clock, usdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, Count } from "./bits";

function Fact({ label, value, format, unit }: { label: string; value: number | null | undefined; format: (v: number) => string; unit: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-[15px] text-ink-2">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="figure text-[2.3rem] text-ink sm:text-[2.8rem]"><Count value={value} format={format} /></span>
        <span className="text-[15px] font-semibold text-ink-2">{unit}</span>
      </p>
    </Card>
  );
}

export function Facts({ reading }: { reading: Reading | null }) {
  const r = reading;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Fact label="Borrowed" value={r?.loan.debt} format={(v) => usdc(v)} unit="USDC" />
      <Fact label="Bitcoin locked" value={r?.loan.collateral} format={btc} unit="cirBTC" />
      <Fact label="Savings, ready" value={r?.savings?.balance} format={(v) => usdc(v)} unit="USDC" />
      <Fact label="Savings in the loan now" value={r?.inLoan} format={(v) => usdc(v)} unit="USDC" />
    </div>
  );
}

/** What the bot did. Only its moves at first; the whole log is one click away. */
export function Moves({ log, empty }: { log: LogEntry[]; empty: string }) {
  const [all, setAll] = useState(false);
  const moves = log.filter((e) => e.level === "action");
  const shown = all ? log : moves;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-ink">What Airbag did</h2>
        {log.length > moves.length && (
          <button type="button" onClick={() => setAll((a) => !a)} className="text-[15px] text-ink-2 underline decoration-current/30 underline-offset-[3px] hover:decoration-current">
            {all ? "Only its moves" : "Show the whole log"}
          </button>
        )}
      </div>
      {shown.length ? (
        <ol className="mt-4 max-h-[26rem] overflow-y-auto">
          {shown.map((e, i) => (
            <li key={`${e.t}-${i}`} className="grid grid-cols-[5rem_1fr] gap-3 border-t border-line py-3.5 first:border-t-0">
              <time dateTime={new Date(e.t).toISOString()} className="mono pt-0.5 text-faint">{clock(e.t)}</time>
              <div className="min-w-0">
                <p className={cn("leading-snug [overflow-wrap:anywhere]", e.level === "action" ? "font-medium text-ink" : e.level === "error" ? "text-critical" : "text-ink-2")}>{e.text}</p>
                {e.txs?.length ? (
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
                    {e.txs.map((t, j) =>
                      t.url ? (
                        <a key={j} href={t.url} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-ink-2 underline decoration-current/30 underline-offset-[3px] hover:decoration-current">
                          {t.label}<ArrowUpRight aria-hidden="true" className="size-3.5" />
                        </a>
                      ) : (
                        <span key={j} className="text-faint">{t.label}</span>
                      ),
                    )}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-ink-2">{empty}</p>
      )}
    </Card>
  );
}
