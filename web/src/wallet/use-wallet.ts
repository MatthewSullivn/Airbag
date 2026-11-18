// The React side of "Connect wallet". Everything that talks to a wallet or prepares a transaction is in core.js;
// this hook only keeps what the page shows: who is connected, their numbers, and the steps of the job in hand.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Sample, WalletView } from "@/lib/api";
import {
  addArcRequest, addCirbtcRequest, ensureArc, execute, isAddress, listWallets, post, reason, recall, requestAccount,
  turnOffProtection, turnOnProtection, type Eip1193, type StepUi, type WalletApp,
} from "./core";

const REFRESH_MS = 5_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface StepLine { id: number; text: string; state: "info" | "wait" | "sent" | "done" | "failed"; hash?: string }
export type Source = "connected" | "looked up";

export interface WalletApi {
  address: string | null;
  how: Source | null;
  walletName: string;
  /** True when the visitor's own wallet app is connected, so the page can ask it to sign. */
  canSign: boolean;
  view: WalletView | null;
  /** Readings of this wallet's loan collected in this tab (the server keeps no history for other wallets). */
  samples: Sample[];
  /** A short line about the wallet as a whole: loading, errors, "cancelled". */
  note: string;
  /** Wallet apps to choose from, when the browser has several. */
  choices: WalletApp[] | null;
  busy: boolean;
  steps: StepLine[];
  /** Counts up every time the visitor starts a job on their own loan, so the page can switch to showing it. */
  acted: number;
  connect(): Promise<void>;
  pick(app: WalletApp): Promise<void>;
  lookup(address: string): boolean;
  disconnect(): void;
  run(action: "open-loan" | "add-savings" | "push" | "calm", body: Record<string, unknown>, done?: string): Promise<void>;
  protect(cap: string): Promise<void>;
  unprotect(): Promise<void>;
  addArc(): Promise<void>;
  addCirbtc(): Promise<void>;
  refresh(): void;
}

export function useWallet(): WalletApi {
  const [address, setAddress] = useState<string | null>(null);
  const [how, setHow] = useState<Source | null>(null);
  const [walletName, setWalletName] = useState("");
  const [canSign, setCanSign] = useState(false);
  const [view, setView] = useState<WalletView | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [note, setNote] = useState("");
  const [choices, setChoices] = useState<WalletApp[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepLine[]>([]);
  const [acted, setActed] = useState(0);

  // what the timers and the wallet's own events need to read without being re-created
  const live = useRef({ address: null as string | null, how: null as Source | null, eth: null as Eip1193 | null, name: "", busy: false, closeUntil: 0, timer: 0 as unknown as ReturnType<typeof setTimeout>, nextId: 1, view: null as WalletView | null });
  const askedToWatch = useRef(new Set<string>());

  const load = useCallback(async () => {
    const L = live.current;
    const asked = L.address;
    if (!asked) return;
    try {
      // right after the visitor's own transaction: skip the server's short cache, so the pushed loan and the bot's answer show up fast
      const res = await fetch(`/api/wallet/${asked}${Date.now() < L.closeUntil ? "?fresh=1" : ""}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (asked !== live.current.address) return;                    // the visitor switched wallets meanwhile
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const v = body as WalletView;
      L.view = v;
      setView(v);
      if (!L.busy) setNote("");
      const r = v.reading;
      if (r) setSamples((prev) => (prev.length && r.at <= prev[prev.length - 1].t ? prev : [...prev.slice(-899), { t: r.at, odds: r.decision.odds, source: r.odds?.source ?? null, line: r.line, health: r.health, btc: r.priceUsed }]));
      // a guard made earlier from this browser: ask the server to watch it again (it checks the guard on-chain itself)
      if (L.how === "connected" && L.eth && !v.protection?.guard && v.protection?.available && v.loan && recall(v.address) && !askedToWatch.current.has(v.address)) {
        askedToWatch.current.add(v.address);
        post("/api/protect", { guard: recall(v.address) }).then(load).catch(() => {});
      }
    } catch (e) {
      if (asked === live.current.address && !live.current.busy) setNote(`Could not read this wallet: ${(e as Error).message}`);
    }
  }, []);

  const keepLooking = useCallback(() => {
    const L = live.current;
    clearTimeout(L.timer);
    const left = L.closeUntil - Date.now();
    L.timer = setTimeout(async () => {
      await load();
      if (live.current.address) keepLooking();
    }, left > 33_000 ? 1_000 : left > 0 ? 2_000 : REFRESH_MS);
  }, [load]);

  const show = useCallback((next: string, source: Source) => {
    const L = live.current;
    L.address = next;
    L.how = source;
    L.view = null;
    setAddress(next);
    setHow(source);
    setCanSign(source === "connected" && !!L.eth);
    setView(null);
    setSamples([]);
    setSteps([]);
    setChoices(null);
    setNote("Reading Arc Testnet…");
    load();
    keepLooking();
  }, [load, keepLooking]);

  const onAccounts = useRef<(accounts: string[]) => void>(() => {});
  // one stable function to hand to the wallet, so it can be taken off again when the visitor disconnects
  const accountsHandler = useRef((accounts: string[]) => onAccounts.current(accounts));
  const forget = useCallback(() => {
    const L = live.current;
    L.eth?.removeListener?.("accountsChanged", accountsHandler.current);
    L.eth = null;
    L.name = "";
    setWalletName("");
    setCanSign(false);
  }, []);
  const disconnect = useCallback(() => {
    const L = live.current;
    clearTimeout(L.timer);
    L.address = null;
    L.how = null;
    L.view = null;
    forget();
    setAddress(null);
    setHow(null);
    setView(null);
    setSamples([]);
    setSteps([]);
    setChoices(null);
    setNote("");
  }, [forget]);
  onAccounts.current = (accounts) => {
    if (live.current.how !== "connected") return;
    if (accounts?.[0] && isAddress(accounts[0])) show(accounts[0], "connected");
    else disconnect();
  };

  /** Connect ONE wallet app, the one the visitor picked. Asks it for its address and nothing else. */
  const pick = useCallback(async (app: WalletApp) => {
    setChoices(null);
    try {
      const account = await requestAccount(app.provider);
      forget();
      const L = live.current;
      L.eth = app.provider;
      L.name = app.name;
      setWalletName(app.name);
      app.provider.on?.("accountsChanged", accountsHandler.current);
      show(account, "connected");
    } catch (e) {
      setNote((e as { code?: number })?.code === 4001 ? "Connection cancelled." : `Could not connect: ${(e as Error)?.message ?? e}`);
    }
  }, [forget, show]);

  const connect = useCallback(async () => {
    const list = await listWallets();
    if (list.length === 1) return pick(list[0]);
    if (!list.length) {
      setChoices(null);
      setNote("No wallet extension found in this browser. Paste an address below instead.");
      return;
    }
    // several wallets installed: the visitor chooses, so a wallet they did not mean to use is never asked
    setChoices(list);
    setNote("Several wallet extensions are installed. Pick the one to connect.");
  }, [pick]);

  const lookup = useCallback((value: string) => {
    if (!isAddress(value)) {
      setNote("That is not a wallet address. It should be 0x followed by 40 characters.");
      return false;
    }
    forget();
    show(value, "looked up");
    return true;
  }, [forget, show]);

  // ---- doing (connected wallets only)
  const stepUi = useCallback((): StepUi => {
    const add = (text: string, state: StepLine["state"]) => {
      const id = live.current.nextId++;
      setSteps((s) => [...s, { id, text, state }]);
      return id;
    };
    const change = (id: number, patch: Partial<StepLine>) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    return {
      summary: (text) => void add(text, "info"),
      step: (label) => {
        const id = add(`${label}. Confirm it in your wallet…`, "wait");
        return {
          sent: (hash) => change(id, { text: `${label}. Sent, waiting for Arc…`, state: "sent", hash }),
          done: (hash) => change(id, { text: `${label}. Done.`, state: "done", hash }),
        };
      },
    };
  }, []);

  /** Runs one job with the chosen wallet: one at a time, buttons off meanwhile, a plain line if it stops. */
  const withWallet = useCallback(async (job: (wallet: Eip1193, from: string, ui: StepUi) => Promise<unknown>, done = "All done.") => {
    const L = live.current;
    const wallet = L.eth, from = L.address;
    if (L.busy || !from || !wallet) return;
    L.busy = true;
    setBusy(true);
    setActed((n) => n + 1);
    setSteps([]);
    const ui = stepUi();
    const say = (text: string, state: StepLine["state"]) => setSteps((s) => [...s, { id: live.current.nextId++, text, state }]);
    try {
      await ensureArc(wallet);
      await job(wallet, from, ui);
      say(done, "done");
    } catch (e) {
      say((e as { code?: number })?.code === 4001 ? "Cancelled in the wallet. Nothing more was sent." : `Stopped: ${reason(e)}`, "failed");
    } finally {
      L.busy = false;
      setBusy(false);
      L.closeUntil = Date.now() + 45_000;
      await sleep(300);
      await load();
      keepLooking();
    }
  }, [stepUi, load, keepLooking]);

  const run = useCallback<WalletApi["run"]>((action, body, done) => withWallet((wallet, from, ui) => execute(wallet, from, action, body, ui), done), [withWallet]);
  const protect = useCallback((cap: string) => withWallet((wallet, from, ui) => turnOnProtection(wallet, from, cap, ui), "Protection is on. The bot is watching this loan now."), [withWallet]);
  const unprotect = useCallback(() => withWallet((wallet, from, ui) => turnOffProtection(wallet, from, live.current.view?.protection?.guard?.address, ui), "Protection is off. The bot can no longer touch this wallet's savings or loan."), [withWallet]);

  // Two helpers for wallets that do not know Arc yet. Each opens the wallet's own confirmation window.
  const ask = useCallback(async (label: string, request: { method: string; params: unknown }) => {
    const wallet = live.current.eth;
    if (!wallet) return;
    try {
      await wallet.request(request);
      setNote(`${label}: done.`);
    } catch (e) {
      setNote((e as { code?: number })?.code === 4001 ? `${label}: cancelled.` : `${label} failed: ${(e as Error)?.message ?? e}`);
    }
  }, []);
  const addArc = useCallback(() => ask("Add Arc Testnet", addArcRequest), [ask]);
  const addCirbtc = useCallback(() => ask("Add cirBTC", addCirbtcRequest), [ask]);

  useEffect(() => () => clearTimeout(live.current.timer), []);

  return { address, how, walletName, canSign, view, samples, note, choices, busy, steps, acted, connect, pick, lookup, disconnect, run, protect, unprotect, addArc, addCirbtc, refresh: load };
}
