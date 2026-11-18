// The strip at the top of both pages: the name, whether this is the live bot or the simulator, and what the bot is doing.
import type { Status } from "@/lib/api";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Wordmark } from "./bits";

export function ModeBadge({ status }: { status: Status | null }) {
  if (!status) return <span className="label rounded-full border border-line px-3 py-1.5 text-faint">connecting…</span>;
  const live = status.mode === "live";
  return (
    <span className={cn("label inline-flex items-center gap-2 rounded-full border px-3 py-1.5", live ? "border-ink/25 text-ink" : "border-line text-ink-2")}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", live ? "bg-good" : "bg-faint")} />
      {live ? "Live · Arc Testnet" : <>Simulator<span className="hidden sm:inline"> · live Gemini odds</span></>}
      {status.dryRun ? " · dry run" : ""}
    </span>
  );
}

export function BotBadge({ status, error }: { status: Status | null; error: string | null }) {
  let text: string, tone: "ok" | "busy" | "bad" | "idle";
  if (!status) { text = error ? `server unreachable (${error})` : "connecting…"; tone = error ? "bad" : "idle"; }
  else if (status.bot.lastError) { text = `error: ${status.bot.lastError.message}`; tone = "bad"; }
  else if (status.paused) { text = "paused (reads, but will not move money)"; tone = "idle"; }
  else if (status.bot.cooldownLeftMs > 0) { text = "just acted · re-reading the loan"; tone = "busy"; }
  else if (status.bot.busy) { text = "checking…"; tone = "busy"; }
  else { text = `watching · checked ${status.bot.lastTick ? ago(status.bot.lastTick, status.now) : "…"}`; tone = "ok"; }
  const w = status?.bot.lastWake;
  if (status && w && w.reason !== "timer" && status.now - w.at < 120_000) text += ` · woken by ${w.reason}`;
  return (
    <span className="inline-flex max-w-full items-center gap-2 text-[13px] text-ink-2" role="status">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", tone === "ok" && "bg-good", tone === "busy" && "animate-pulse bg-brand", tone === "bad" && "bg-critical", tone === "idle" && "bg-faint")} />
      <span className="truncate">{text}</span>
    </span>
  );
}

export function TopBar({ status, error, home, children }: { status: Status | null; error: string | null; home: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <a href={home} className="no-underline" aria-label="Airbag, home"><Wordmark /></a>
        <ModeBadge status={status} />
        <BotBadge status={status} error={error} />
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
