// "Try it with your own wallet": four steps, one on screen at a time, with a bar showing where you are.
// Every transaction is prepared by the server and signed in the visitor's own wallet
// (src/wallet/core.js does that part, unchanged from the classic page).
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Loader, Wallet, X } from "lucide-react";
import type { Status, WalletView } from "@/lib/api";
import { btc, short, usd, usdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LIVE_URL } from "@/recorded/proof";
import { recall } from "@/wallet/core";
import type { WalletApi } from "@/wallet/use-wallet";
import { Button, Card, ExplorerLink, Panel } from "./bits";

const FIELDS = ["collateral", "borrow", "save", "cap"] as const;
type Field = (typeof FIELDS)[number];
const NAMES = ["Open a loan", "Add savings", "Turn on protection", "Push it"];
const WHY = [
  "Lock some test bitcoin and borrow dollars against it.",
  "Put spare dollars aside. This is your airbag, and it earns interest while it waits.",
  "Let Airbag move your savings into your loan when it must. That is all it can do.",
  "Make your loan risky on purpose. Then hands off, and watch Airbag save it.",
];

function Progress({ done, current, onPick }: { done: boolean[]; current: number; onPick?: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {NAMES.map((name, i) => (
        <li key={name}>
          <button type="button" disabled={!onPick} onClick={() => onPick?.(i)} className="block w-full text-left disabled:cursor-default" aria-current={i === current ? "step" : undefined}>
            <span className={cn("block h-1.5 rounded-full transition-colors", done[i] ? "bg-good" : i === current ? "bg-brand" : "bg-panel-3")} />
            <span className={cn("mt-2.5 flex items-center gap-1.5 text-[14px] sm:text-[15px]", i === current ? "font-semibold text-on-panel" : "text-on-panel-faint")}>
              {done[i] && <Check aria-hidden="true" className="size-4 shrink-0 text-good" strokeWidth={3} />}
              <span className="sm:hidden">{i + 1}</span>
              <span className="hidden truncate sm:inline">{name}</span>
              {done[i] && <span className="sr-only">(done)</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Wizard({ wallet, status }: { wallet: WalletApi; status: Status }) {
  const v = wallet.view;
  const explorer = v?.explorer ?? "https://explorer.testnet.arc.io";
  const [paste, setPaste] = useState("");

  return (
    <div className="grid gap-3">
      <Panel aria-label="Try it with your own wallet">
        {!wallet.address ? (
          <>
            <Progress done={[false, false, false, false]} current={-1} />
            <div className="mx-auto max-w-xl py-12 text-center sm:py-16">
              <h2 className="display text-[clamp(2rem,4.6vw,3.2rem)]">Four steps, a few minutes.</h2>
              <p className="mt-4 text-[1.1rem] leading-relaxed text-on-panel-2">Test money only. You approve every step in your own wallet. This page never sees your key.</p>
              <Button variant="brand" size="lg" className="mt-8" onClick={wallet.connect}><Wallet aria-hidden="true" className="size-5" /> Connect wallet</Button>
              {wallet.choices && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-on-panel-2">
                  Which one?
                  {wallet.choices.map((w) => <Button key={w.name} size="sm" onClick={() => wallet.pick(w)}>{w.name}</Button>)}
                </div>
              )}
              {wallet.note && <p role="status" className="mt-5 text-[15px] text-on-panel-2">{wallet.note}</p>}
              {status.mode !== "live" && (
                <p className="mt-6 text-[15px] text-on-panel-faint">
                  This is the simulator. Steps 3 and 4 only work on the live site:{" "}
                  <a href={`${LIVE_URL}/app/#mine`} className="text-on-panel-2 underline underline-offset-[3px] hover:text-on-panel">airbagged.me</a>.
                </p>
              )}
            </div>
          </>
        ) : v ? (
          <Steps wallet={wallet} v={v} status={status} explorer={explorer} />
        ) : (
          <p role="status" className="py-16 text-center text-on-panel-2">{wallet.note || "Reading Arc Testnet…"}</p>
        )}
      </Panel>

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
        <form className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-3 sm:basis-0" onSubmit={(e) => { e.preventDefault(); if (wallet.lookup(paste.trim())) setPaste(""); }}>
          <label htmlFor="wallet-paste" className="text-[15px] text-ink-2">No wallet? Look at any address</label>
          <input id="wallet-paste" value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} autoComplete="off" placeholder="0x…" className="mono min-w-0 flex-1 basis-40 rounded-full border border-line bg-page px-4 py-2.5 text-ink placeholder:text-faint" />
          <Button type="submit" variant="ink" size="sm">Look</Button>
        </form>
        {wallet.address && (
          <Button variant="outline" size="sm" onClick={wallet.disconnect}><X aria-hidden="true" className="size-4" /> {wallet.how === "connected" ? "Disconnect" : "Close"}</Button>
        )}
      </Card>
    </div>
  );
}

function Steps({ wallet, v, status, explorer }: { wallet: WalletApi; v: WalletView; status: Status; explorer: string }) {
  const o = v.offers, P = v.protection, guard = P.guard;
  const done = [!!v.loan, v.savings >= 0.01, !!guard || v.protectedHere, false];
  const current = done.indexOf(false);
  const [picked, setPicked] = useState<number | null>(null);
  const step = picked ?? current;
  const signer = wallet.canSign;
  const busy = wallet.busy;

  // The inputs suggest sensible numbers until the visitor types their own; after a finished job they suggest again.
  const [vals, setVals] = useState<Record<Field, string>>({ collateral: "", borrow: "", save: "", cap: "" });
  const touched = useRef(new Set<Field>());
  const suggested: Record<Field, string> = {
    collateral: v.cirbtc > 0 ? String(+v.cirbtc.toFixed(8)) : "0",
    borrow: o.suggestBorrow >= 0.01 ? o.suggestBorrow.toFixed(2) : "",
    save: Math.min(10, o.savingsMax).toFixed(2),
    cap: String(o.suggestCap),
  };
  const key = FIELDS.map((f) => suggested[f]).join("|");
  useEffect(() => {
    setVals((prev) => {
      const next = { ...prev };
      for (const f of FIELDS) if (!touched.current.has(f)) next[f] = suggested[f];
      return next;
    });
    // `key` stands for every suggestion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const last = wallet.steps[wallet.steps.length - 1];
  useEffect(() => {
    if (!busy && last?.state === "done") {
      touched.current.clear();
      setPicked(null);          // on to whatever step is next now
    }
  }, [busy, last?.state, last?.id]);

  const field = (f: Field, before: string, after: string) => (
    <label className="flex flex-wrap items-center gap-2.5 text-[1.05rem] text-on-panel-2">
      {before}
      <input
        inputMode="decimal"
        autoComplete="off"
        value={vals[f]}
        onChange={(e) => {
          touched.current.add(f);
          setVals((p) => ({ ...p, [f]: e.target.value }));
        }}
        className="w-36 rounded-2xl border border-panel-line bg-panel-2 px-4 py-2.5 text-right font-display text-[1.5rem] font-bold leading-none text-on-panel"
      />
      {after}
    </label>
  );

  const canBorrow = o.maxBorrow >= 0.01 && (v.cirbtc > 0 || !!v.loan);
  const blocked = !P.available ? P.why : v.savings < 0.01 ? "Add savings first. Protection moves your savings into your loan, so there has to be some." : "";

  let body: React.ReactNode;
  if (!signer) {
    body = <p className="text-[1.05rem] text-on-panel-2">You are only looking at this wallet. Connect it to do these steps yourself.</p>;
  } else if (step === 0) {
    body = canBorrow ? (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); wallet.run("open-loan", { collateral: vals.collateral.trim(), borrow: vals.borrow.trim() }); }}>
        <div className="flex flex-wrap gap-x-6 gap-y-3">{field("collateral", "Lock", "cirBTC")}{field("borrow", "and borrow", "USDC")}</div>
        <Button type="submit" variant="brand" size="lg" disabled={busy}>{v.loan ? "Borrow more" : "Open the loan"}</Button>
        <p className="text-[15px] text-on-panel-faint">Up to {o.maxBorrow.toFixed(2)} USDC keeps you safely away from the edge.</p>
      </form>
    ) : (
      <p className="text-[1.05rem] text-on-panel-2">You need some test bitcoin first. Get cirBTC free at <a href="https://faucet.circle.com" target="_blank" rel="noopener" className="underline underline-offset-[3px]">faucet.circle.com</a> (choose Arc Testnet).</p>
    );
  } else if (step === 1) {
    body = o.savingsMax >= 0.01 ? (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); wallet.run("add-savings", { amount: vals.save.trim() }); }}>
        {field("save", "Put", "USDC into savings")}
        <Button type="submit" variant="brand" size="lg" disabled={busy}>Add savings</Button>
        <p className="text-[15px] text-on-panel-faint">Up to {o.savingsMax.toFixed(2)} USDC. The rest stays in your wallet for fees.</p>
      </form>
    ) : (
      <p className="text-[1.05rem] text-on-panel-2">You need some test USDC first. Get it free at <a href="https://faucet.circle.com" target="_blank" rel="noopener" className="underline underline-offset-[3px]">faucet.circle.com</a> (choose Arc Testnet).</p>
    );
  } else if (step === 2) {
    body = guard ? (
      <div className="space-y-4 text-[1.05rem] text-on-panel-2">
        <p>
          Protection is on, through your own guard <ExplorerLink explorer={explorer} kind="address" id={guard.address} />. It may move up to {guard.capUsdc} USDC a day.
          {guard.lastError ? ` Problem: ${guard.lastError}.` : ""}
        </p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={wallet.unprotect}>Turn protection off</Button>
      </div>
    ) : v.protectedHere ? (
      <p className="text-[1.05rem] text-on-panel-2">This is the wallet this server's own bot already protects.</p>
    ) : v.loan ? (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); wallet.protect(vals.cap.trim()); }}>
        {field("cap", "Let it move up to", "USDC a day")}
        <Button type="submit" variant="brand" size="lg" disabled={busy || !!blocked}>{recall(v.address) ? "Finish turning it on" : "Turn on protection"}</Button>
        <p className="text-[15px] text-on-panel-faint">{blocked || "Your wallet will ask three times: once to create your guard, twice to give it permission."}</p>
      </form>
    ) : (
      <p className="text-[1.05rem] text-on-panel-2">Open a loan first. There is nothing to protect yet.</p>
    );
  } else {
    body = guard ? (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" size="lg" disabled={busy} onClick={() => wallet.run("push", {}, "Pushed. Now keep your hands off and watch the bot.")}>Push it to the edge</Button>
          <Button size="lg" disabled={busy} onClick={() => wallet.run("calm", {}, "Calmer. The bot gives your savings back by itself when it is safe to.")}>Calm it down</Button>
        </div>
        <p className="text-[15px] text-on-panel-faint">
          {guard.inLoan > 0 ? `${usdc(guard.inLoan)} USDC of your savings is in the loan now. It comes back when things are calm. ` : ""}
          {guard.lastMove ? <>Airbag's last move: <ExplorerLink explorer={explorer} kind="tx" id={guard.lastMove.tx}>{guard.lastMove.kind === "save" ? "saved" : "gave back"} {usdc(guard.lastMove.usdc)} USDC</ExplorerLink>.</> : "Your loan is just below: the big number turns red, then Airbag answers."}
        </p>
      </div>
    ) : (
      <p className="text-[1.05rem] text-on-panel-2">Turn on protection first. Otherwise nobody is there to save it.</p>
    );
  }

  return (
    <>
      <Progress done={done} current={step} onPick={signer ? setPicked : undefined} />

      <div className="mt-10 grid gap-x-12 gap-y-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-[15px] text-on-panel-faint">Step {step + 1} of 4</p>
          <h2 className="display mt-2 text-[clamp(2rem,4.6vw,3.2rem)]">{NAMES[step]}</h2>
          <p className="mt-3 max-w-[38ch] text-[1.1rem] leading-relaxed text-on-panel-2">{WHY[step]}</p>
          <div className="mt-7">{body}</div>
        </div>

        <dl className="grid content-start gap-x-6 gap-y-5 rounded-3xl border border-panel-line bg-panel-2 p-6 sm:grid-cols-2 lg:grid-cols-1">
          {[
            ["In your wallet", `${usdc(v.usdc)} USDC`, v.cirbtc > 0 ? `and ${btc(v.cirbtc)} cirBTC` : ""],
            ["Your loan", v.loan ? `${usdc(v.loan.debt)} USDC` : "None yet", v.loan ? `you lose the bitcoin below ${usd(v.loan.line)}` : ""],
            ["Your savings", `${usdc(v.savings)} USDC`, ""],
          ].map(([label, value, sub]) => (
            <div key={label}>
              <dt className="text-[15px] text-on-panel-faint">{label}</dt>
              <dd className="figure mt-1.5 text-[2.1rem] text-on-panel">{value}</dd>
              {sub && <dd className="mt-1 text-[14px] text-on-panel-faint">{sub}</dd>}
            </div>
          ))}
          <div className="text-[14px] text-on-panel-faint sm:col-span-2 lg:col-span-1">
            {wallet.how === "connected" ? `${wallet.walletName} · ` : "Looking at "}
            <ExplorerLink explorer={explorer} kind="address" id={v.address} /> · Arc Testnet
          </div>
        </dl>
      </div>

      {wallet.steps.length > 0 && (
        <ol aria-live="polite" className="mt-8 space-y-2.5 rounded-3xl border border-panel-line bg-panel-2 p-6 text-[1.05rem]">
          {wallet.steps.map((s) => (
            <li key={s.id} className={cn("flex items-start gap-3", s.state === "done" ? "text-on-panel" : s.state === "failed" ? "text-[#ff8a80]" : "text-on-panel-2")}>
              <span className="mt-1 shrink-0" aria-hidden="true">
                {s.state === "done" ? <Check className="size-5 text-good" strokeWidth={3} /> : s.state === "failed" ? <X className="size-5" /> : s.state === "info" ? <span className="block size-5" /> : <Loader className="size-5 animate-spin text-brand" />}
              </span>
              <span className="min-w-0">
                {s.text}
                {s.hash && (
                  <a href={`${explorer}/tx/${s.hash}`} target="_blank" rel="noopener" className="ml-2 inline-flex items-center gap-0.5 text-[15px] underline decoration-current/40 underline-offset-[3px]">
                    see it<ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {signer && (
        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-on-panel-faint">
          Wallet does not know Arc yet?
          <button type="button" onClick={wallet.addArc} className="underline underline-offset-[3px] hover:text-on-panel-2">Add Arc Testnet</button>
          <button type="button" onClick={wallet.addCirbtc} className="underline underline-offset-[3px] hover:text-on-panel-2">Add cirBTC</button>
          {status.mode !== "live" && <span>This page is the simulator. Steps 3 and 4 need the live site: <a href={`${LIVE_URL}/app/#mine`} className="underline underline-offset-[3px] hover:text-on-panel-2">airbagged.me</a>.</span>}
        </p>
      )}
      {wallet.note && <p role="status" className="mt-4 text-[15px] text-on-panel-2">{wallet.note}</p>}
    </>
  );
}
