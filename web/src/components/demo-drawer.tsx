// Demo controls for the bot's own loan: push it to the edge, reset, pause, change the limit.
// On the live bot they need the team's key (press d). On the hosted simulator anyone may press them.
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { postJson, type Status } from "@/lib/api";
import { Button } from "./bits";
import { MetalButton, ShinyButton } from "./ui/cta";

const read = (k: string) => { try { return sessionStorage.getItem(k) ?? ""; } catch { return ""; } };
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function useDemoDrawer(status: Status | null) {
  // /app/?demo opens it straight away (on the live bot it then asks for the team's key)
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has("demo"));
  const greeted = useRef(false);
  useEffect(() => {
    // on the simulator the controls are the point of the screen, so they start open
    if (status?.mode !== "sim" || greeted.current) return;
    greeted.current = true;
    setOpen(true);
  }, [status?.mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if (!typing && (e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) setOpen((o) => !o);
      else if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function DemoDrawer({ status, open, onClose, onActs }: { status: Status; open: boolean; onClose(): void; onActs(kind: "push" | "reset"): void }) {
  const [key, setKey] = useState(() => read("airbag-demo-key"));
  const [typed, setTyped] = useState(key);
  const [unlocked, setUnlocked] = useState(false);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState("");
  const [limit, setLimit] = useState("");
  const limitFocused = useRef(false);

  const unlock = useCallback(async (k: string) => {
    try {
      await postJson("/api/demo/check-key", {}, k);
      write("airbag-demo-key", k);
      setKey(k);
      setUnlocked(true);
      setOut("");
    } catch (e) {
      setUnlocked(false);
      setOut(`Locked: ${(e as Error).message}`);
    }
    // only the mode matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.publicDemo]);
  useEffect(() => { if (open) unlock(key); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => { if (!limitFocused.current) setLimit(String(+(status.limit * 100).toFixed(2))); }, [status.limit]);

  const act = async (label: string, path: string, body: unknown) => {
    setBusy(label);
    setOut(`${label}…`);
    if (/push|reset/.test(path)) onActs(/push/.test(path) ? "push" : "reset");   // these act on the bot's own loan, so show that one
    try {
      const j = await postJson<{ result?: string }>(path, body, key);
      setOut(`${label}: ${j.result ?? "done"}`);
    } catch (e) {
      setOut(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  // every save keeps some of the simulated savings in the loan: after a dozen pushes there is nothing left to save with
  const spent = status.mode === "sim" && !!status.reading && (status.reading.savings?.balance ?? 0) < 1;

  if (!open) return null;
  // A slim strip that takes its own room at the top of the screen (and stays there while scrolling): it must
  // never sit on the numbers it changes.
  return (
    <aside aria-labelledby="demo-title" className="sticky top-3 z-40 md:top-[5.4rem] rounded-[22px] border border-panel-line bg-panel px-4 py-3 text-on-panel shadow-xl sm:px-5">
      <button type="button" onClick={onClose} aria-label="Close demo controls" className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-on-panel-faint hover:text-on-panel"><X className="size-4" /></button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pr-8">
        <h2 id="demo-title" className="label text-on-panel-faint">Demo{status.mode === "live" ? " · the bot's own loan" : ""}</h2>
        {!unlocked ? (
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); unlock(typed.trim()); }}>
            <label htmlFor="demo-key" className="sr-only">Demo key</label>
            <input id="demo-key" type="password" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="demo key" className="min-w-0 flex-1 rounded-full border border-panel-line bg-panel-2 px-4 py-2 text-on-panel placeholder:text-on-panel-faint/60" />
            <Button type="submit" size="sm">Unlock</Button>
          </form>
        ) : (
          <>
            <ShinyButton small disabled={!!busy || spent} onClick={() => act("Push it to the edge", "/api/demo/push", {})}>Push it to the edge</ShinyButton>
            <MetalButton small disabled={!!busy} onClick={() => act("Reset", "/api/demo/reset", {})}>Reset</MetalButton>
            {!status.publicDemo && (
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => act("Pause / resume", "/api/demo/pause", { paused: !status.paused })}>{status.paused ? "Resume bot" : "Pause bot"}</Button>
            )}
            <form className="hidden items-center gap-1.5 text-[13.5px] text-on-panel-2 sm:flex" onSubmit={(e) => { e.preventDefault(); act("Set limit", "/api/demo/limit", { limit: Number(limit) / 100 }); }}>
              <label htmlFor="demo-limit">Limit</label>
              <input id="demo-limit" type="number" min={0.1} max={50} step={0.1} inputMode="decimal" value={limit} onFocus={() => (limitFocused.current = true)} onBlur={() => (limitFocused.current = false)} onChange={(e) => setLimit(e.target.value)} className="w-16 rounded-full border border-panel-line bg-panel-2 px-3 py-1.5 text-right text-on-panel" />
              %
              <Button type="submit" size="sm" disabled={!!busy}>Set</Button>
            </form>
          </>
        )}
      </div>
      <p role="status" className="mt-2 line-clamp-2 text-[13px] leading-snug text-on-panel-2 empty:hidden">{spent ? "This simulated loan has used up its savings, so Airbag cannot save it again. It starts fresh when the simulator restarts." : out || (status.mode === "sim" ? "Press it, then hands off. Airbag saves the loan by itself." : "")}</p>
    </aside>
  );
}
