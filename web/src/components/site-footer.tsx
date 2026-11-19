// The last line of the app: what it is built on, who signs, and the way to the code. One or two short lines.
import type { Status } from "@/lib/api";
import { ExplorerLink } from "./bits";

export function SiteFooter({ status }: { status: Status | null }) {
  const live = status?.mode === "live";
  return (
    <footer className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-t border-line py-6 text-[13.5px] text-faint">
      <p className="max-w-3xl">
        Built on Arc with Circle's Borrow Kit and Earn Kit. Odds from Gemini's prediction market.
        {status && live ? (
          status.custody?.mode === "guard" && status.custody.guard ? (
            <> The bot signs through <ExplorerLink explorer={status.explorer} kind="address" id={status.custody.guard}>AirbagGuard</ExplorerLink>{status.custody.ownerKeyOnServer ? "." : " and holds no wallet key."}</>
          ) : status.wallet?.address ? (
            <> Bot wallet <ExplorerLink explorer={status.explorer} kind="address" id={status.wallet.address} />.</>
          ) : null
        ) : status ? " The demo loan on this page is simulated. The odds are live." : ""}
      </p>
      <a href="https://github.com/MatthewSullivn/airbag" target="_blank" rel="noopener" className="underline decoration-current/30 underline-offset-2 hover:decoration-current">Code on GitHub</a>
    </footer>
  );
}
