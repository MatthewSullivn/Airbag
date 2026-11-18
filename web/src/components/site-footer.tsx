// The last line of both pages: what this is built on, who signs, and the way to the code.
import type { Status } from "@/lib/api";
import { usdc } from "@/lib/format";
import { ExplorerLink } from "./bits";

export function SiteFooter({ status, onDemo }: { status: Status | null; onDemo?: () => void }) {
  const live = status?.mode === "live";
  return (
    <footer className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-t border-line py-6 text-[13px] text-faint">
      <p className="max-w-3xl">
        Built on Arc with Circle's Borrow Kit and Earn Kit. Odds from Gemini's prediction markets. Woken by a QuickNode Stream.
        {status && live && status.wallet?.address ? (
          <>
            {" "}Bot wallet <ExplorerLink explorer={status.explorer} kind="address" id={status.wallet.address} />
            {status.wallet.usdc != null ? `, ${usdc(status.wallet.usdc)} USDC for gas and demos` : ""}.
            {status.custody?.mode === "guard" && status.custody.guard ? (
              <> The bot signs through <ExplorerLink explorer={status.explorer} kind="address" id={status.custody.guard}>AirbagGuard</ExplorerLink>{status.custody.ownerKeyOnServer ? "." : ", and this server does not hold the wallet's key."}</>
            ) : null}
          </>
        ) : status ? " This page runs the simulator: a simulated wallet and no real transactions." : ""}
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a href="/classic/" className="underline decoration-current/30 underline-offset-2 hover:decoration-current">The old page</a>
        <a href="https://github.com/MatthewSullivn/ubc" target="_blank" rel="noopener" className="underline decoration-current/30 underline-offset-2 hover:decoration-current">Code on GitHub</a>
        {onDemo && status && !status.publicDemo && (
          <button type="button" onClick={onDemo} className="underline decoration-current/30 underline-offset-2 hover:decoration-current">
            Press <kbd className="mono rounded border border-line px-1">d</kbd> for demo controls
          </button>
        )}
      </p>
    </footer>
  );
}
