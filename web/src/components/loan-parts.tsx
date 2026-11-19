// The quiet part under a loan's cards: the list of what Airbag did. (The money itself is in arc-now.tsx.)
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { LogEntry } from "@/lib/api";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "./bits";

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
