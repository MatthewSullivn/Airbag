// Airbag server: the bot loop + the dashboard + JSON status + webhook endpoints.
//   npm start          live, on Arc Testnet (needs .env)
//   npm run sim        simulated Arc (no wallet needed), live Gemini odds
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { makeArc } from "./arc.js";
import { GeminiOdds } from "./gemini.js";
import { Store, type StreamEvent } from "./state.js";
import { Bot, ladderStatus } from "./bot.js";
import { RULE, health as healthOf } from "./brain.mjs";
import { describeReceipt, isTxHash } from "./stream-verify.mjs";
import { betsFromEvent, type BetPrice } from "./hedge.mjs";
import { pointsFromCandles, type BetHistory } from "./market-history.mjs";
import { makeRateLimiter, publicAllows, publicDemoOn } from "./public-demo.mjs";
import { makeWalletReader } from "./wallet-view.js";
import { makeWalletPlanner, offersFor, PlanError } from "./wallet-plan.js";
import { Protector } from "./protector.js";
import { isAddress } from "./wallet-math.mjs";
import { createPublicClient, http } from "viem";
import { arcTestnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = new Store(join(root, "data", `state.${config.mode}.json`), { fresh: config.mode === "sim" });
const gemini = new GeminiOdds(config.geminiTickers);
const startSpot = (await gemini.spot()).price ?? 64_000;
const arc = makeArc(config, startSpot);
const bot = new Bot(arc, gemini, store, config);

await arc.init();
store.log("info", `Airbag started (${config.mode}${config.dryRun ? ", dry run" : ""}). Wallet ${arc.address}. Market ${arc.marketId}. Savings vault ${arc.vault?.name ?? "none"}. Loan ${arc.loanId ?? "not opened yet"}.`);
if (arc.custody?.mode === "guard")
  store.log("info", `Signing through AirbagGuard ${arc.custody.guard} with bot key ${arc.custody.botKeyAddress} (on-chain cap ${arc.custody.guardDailyCapUsdc} USDC a day). ${arc.custody.ownerKeyOnServer ? "The wallet's own key is also here, for the demo buttons." : "The wallet's own key is not on this server."}`);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "5mb" }));
app.use(express.static(join(root, "public")));

// ---- auth for POST routes: shared secret in header x-airbag-key or ?key=.
// With no secret set, only direct requests from this machine pass. A tunnel (cloudflared) also
// connects from this machine, so anything carrying proxy headers is treated as remote.
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const viaProxy = (req: Request) => ["x-forwarded-for", "cf-connecting-ip", "forwarded", "x-real-ip"].some((h) => req.headers[h] != null);
const loopback = (req: Request) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
function auth(req: Request, res: Response, next: NextFunction) {
  const given = String(req.get("x-airbag-key") ?? req.query.key ?? "");
  const ok = config.webhookSecret ? safeEq(given, config.webhookSecret) : loopback(req) && !viaProxy(req);
  if (ok) return next();
  res.status(401).json({ error: config.webhookSecret ? "missing or wrong key" : "set WEBHOOK_SECRET to accept requests from outside this machine" });
}

// ---- public demo (hosted simulator only): anyone may press the demo buttons, under one shared rate limit.
// publicDemoOn() is false in live mode whatever PUBLIC_DEMO says, so the live bot always needs the key.
const publicDemo = publicDemoOn(config.mode, config.publicDemoFlag);
const publicHit = makeRateLimiter(30, 60_000);
const demoAuth = (action: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!publicDemo) return auth(req, res, next);
  const given = String(req.get("x-airbag-key") ?? req.query.key ?? "");
  if (config.webhookSecret && given && safeEq(given, config.webhookSecret)) return next();   // the team keeps every control
  if (!publicAllows(action)) return res.status(403).json({ error: "not available in the public demo" });
  if (!publicHit()) return res.status(429).json({ error: "lots of people are trying it right now, give it a few seconds" });
  next();
};
if (publicDemo) console.log("Public demo is ON: anyone can press Push / Reset / Limit on this simulator.");

// ---- status for the dashboard (polled every 1-2 s). No secrets in here.
app.get("/api/status", (_req, res) => {
  const r = bot.last;
  const hourAgo = Date.now() - 3600_000;
  res.json({
    now: Date.now(),
    mode: config.mode,
    publicDemo,
    dryRun: config.dryRun,
    paused: bot.paused,
    explorer: config.mode === "live" ? config.explorer : null,
    wallet: { address: arc.address, ...(r?.wallet ?? {}) },
    custody: arc.custody,
    protector: protector.summary(),
    marketId: arc.marketId,
    lltv: arc.lltv,
    limit: bot.limit,
    rule: RULE,
    dailyCapUsdc: config.dailyCapUsdc,
    movedLast24h: store.movedLast24h(),
    bot: {
      busy: bot.busy,
      syncing: bot.syncing,
      noLoan: bot.noLoan,
      ticks: bot.ticks,
      lastTick: bot.lastTick,
      lastWake: bot.lastWake,
      lastError: bot.lastError,
      geminiError: bot.geminiError,
      tickSeconds: config.tickSeconds,
      cooldownLeftMs: bot.cooldownLeftMs,
    },
    reading: r && {
      at: r.at,
      loan: r.loan,
      savings: r.savings,
      inLoan: store.inLoan,
      spot: r.spot,
      priceUsed: r.priceUsed,
      priceSource: r.priceSource,
      line: r.line,
      health: r.health,
      odds: r.odds,
      ladders: r.ladders,
      decision: r.decision,
    },
    log: store.recentLog(60),
    samples: store.samplesSince(hourAgo),
    stream: store.recentStream(15),
  });
});

app.get("/api/replay", (_req, res) => {
  const f = join(root, "replay", "results.json");
  if (!existsSync(f)) return res.status(404).json({ error: "run npm run replay first" });
  res.type("json").send(readFileSync(f, "utf8"));
});

app.get("/healthz", (_req, res) => res.json({ ok: true, ticks: bot.ticks }));

// ---- Gemini's ladders as they are (each strike and the chance BTC ends above it), so the page can draw the
// market's own curve with the loan's line on it. Read-only, and the ladders are cached for about 20 s.
// It also passes on each bet's price to BUY "No" right now (a "No" pays 1 dollar if bitcoin ends below that
// price). The page uses it to quote what a hedge would cost. A quote only: nothing here places an order.
// And the market's own page on gemini.com, so the page can link to it: /predictions/<ticker>/<slug>.
interface EventExtras { bets: BetPrice[]; url: string | null }
const betCache = new Map<string, { at: number } & EventExtras>();
async function extrasOf(ticker: string): Promise<EventExtras> {
  const hit = betCache.get(ticker);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  try {
    const r = await fetch(`https://api.gemini.com/v1/prediction-markets/events/${encodeURIComponent(ticker)}`, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
    const event = (await r.json()) as { slug?: unknown };
    const slug = typeof event.slug === "string" && /^[a-z0-9-]{1,120}$/.test(event.slug) ? event.slug : null;
    const next = { at: Date.now(), bets: betsFromEvent(event), url: slug ? `https://www.gemini.com/predictions/${encodeURIComponent(ticker)}/${slug}` : null };
    betCache.set(ticker, next);
    return next;
  } catch {
    return hit ?? { bets: [], url: null };
  }
}
app.get("/api/ladders", async (_req, res) => {
  const [snap, spot] = await Promise.all([gemini.get(), gemini.spot()]);
  res.json({
    at: snap.fetchedAt,
    spot: spot.price,
    error: snap.error,
    events: await Promise.all(snap.events.map(async (e) => {
      const extras = await extrasOf(e.ticker);
      return { ticker: e.ticker, title: e.title, expiryDate: e.expiryDate, volume: e.volume, ladder: e.ladder, bets: extras.bets, url: extras.url };
    })),
  });
});

// ---- The market's own history: Gemini's hourly candles for each bet of one of OUR ladders (the last traded
// price of "bitcoin ends at or above X", hour by hour). Read-only public market data, cached for ten minutes.
// Only the ladders the bot is reading are answered, so nothing else can be fetched through this route.
const historyCache = new Map<string, { at: number; body: unknown }>();
app.get("/api/market-history", async (req, res) => {
  const snap = await gemini.get();
  const want = typeof req.query.ticker === "string" ? req.query.ticker : snap.events[0]?.ticker;
  const event = snap.events.find((e) => e.ticker === want);
  if (!event) return res.status(404).json({ error: "not one of the ladders the bot reads" });
  const hit = historyCache.get(event.ticker);
  if (hit && Date.now() - hit.at < 10 * 60_000) return res.json(hit.body);
  const bets = (await extrasOf(event.ticker)).bets;
  const all = await Promise.all(bets.map(async (b): Promise<BetHistory | null> => {
    if (!b.symbol) return null;
    try {
      const r = await fetch(`https://api.gemini.com/v2/candles/${encodeURIComponent(b.symbol)}/1hr`, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
      if (!r.ok) return null;
      const points = pointsFromCandles(await r.json());
      return points.length > 1 ? { strike: b.strike, symbol: b.symbol, points } : null;
    } catch {
      return null;
    }
  }));
  const series = all.filter((s): s is BetHistory => s != null);
  if (!series.length && hit) return res.json(hit.body);                 // Gemini did not answer: keep showing what we had
  const body = { at: Date.now(), ticker: event.ticker, title: event.title, expiryDate: event.expiryDate, frame: "1hr", series };
  // an empty answer is only kept for a minute, so the next visitor tries again soon
  historyCache.set(event.ticker, { at: series.length ? Date.now() : Date.now() - 9 * 60_000, body });
  res.json(body);
});

// ---- What a move costs: Arc's gas price right now, on testnet and on mainnet. Read-only (two eth_gasPrice
// calls, no key, nothing sent), cached for five minutes. The page multiplies it by the gas our recorded
// transactions used, to say what the same moves would cost on mainnet. Mainnet is only ever READ here.
const ARC_MAINNET_RPC = "https://rpc.mainnet.arc.io";   // chain id 5042
let gasCache: { at: number; body: unknown } | null = null;
async function gasPriceOf(rpc: string): Promise<{ chainId: number; gasPriceWei: string } | null> {
  try {
    const call = async (method: string) => {
      const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }), signal: AbortSignal.timeout(8000) });
      const j = (await r.json()) as { result?: string };
      if (!j.result) throw new Error("no result");
      return j.result;
    };
    const [chainId, price] = await Promise.all([call("eth_chainId"), call("eth_gasPrice")]);
    return { chainId: Number(BigInt(chainId)), gasPriceWei: BigInt(price).toString() };
  } catch {
    return null;
  }
}
app.get("/api/gas", async (_req, res) => {
  if (!gasCache || Date.now() - gasCache.at > 5 * 60_000) {
    const [testnet, mainnet] = await Promise.all([gasPriceOf(config.rpcUrl), gasPriceOf(ARC_MAINNET_RPC)]);
    if (testnet || mainnet || !gasCache) gasCache = { at: Date.now(), body: { at: Date.now(), testnet, mainnet } };
  }
  res.json(gasCache!.body);
});

// ---- "Connect wallet": a read-only look at any wallet on Arc Testnet (balances, its loan, its odds).
// Public by design: it only reads public chain data and never signs anything. One shared rate limit.
const walletIds = { marketId: arc.marketId, vault: arc.vault?.address ?? null };
const readWalletView = makeWalletReader(config, gemini, walletIds);
// Wallets that turned protection on from the page: each has its own AirbagGuard for our bot key (src/protector.ts).
const protector = new Protector(config, gemini, store, readWalletView, { ids: walletIds, limit: () => bot.limit, skipGuard: arc.custody?.guard ?? null });
const walletHit = makeRateLimiter(300, 60_000);
app.get("/api/wallet/:address", async (req, res) => {
  const address = String(req.params.address);
  if (!isAddress(address)) return res.status(400).json({ error: "that is not a wallet address (0x followed by 40 characters)" });
  if (!walletHit()) return res.status(429).json({ error: "lots of lookups right now, try again in a minute" });
  try {
    // ?fresh=1: the page asks right after the visitor's own transaction, so it must not get the answer from before it
    const view = await readWalletView(address, { fresh: req.query.fresh === "1" });
    const guarded = protector.forOwner(address);
    const live = config.mode === "live";
    const protectedHere = live && address.toLowerCase() === arc.address.toLowerCase();
    const L = view.loan;
    res.json({
      ...view,
      // The same shape as "reading" in /api/status, so the page can show THIS loan in the big number, the cards and the chart.
      reading: L && {
        at: view.at,
        loan: {
          debt: L.debt,
          collateral: L.collateral,
          borrowApy: live ? bot.last?.loan.borrowApy ?? null : null,   // one market, so one borrow rate for everybody
          healthFactor: healthOf(L.debt, L.collateral, view.market.oraclePrice, view.market.lltv),
          band: null,
          oraclePrice: view.market.oraclePrice,
        },
        savings: { vaultName: live && arc.vault ? arc.vault.name : "Earn Kit savings vault", balance: view.savings, apy: live ? arc.vault?.apy ?? null : null },
        inLoan: protectedHere ? store.inLoan : guarded?.inLoan ?? 0,
        spot: L.priceSource === "real" ? L.priceUsed : null,
        priceUsed: L.priceUsed,
        priceSource: L.priceSource,
        line: L.line,
        health: L.health,
        odds: L.odds,
        ladders: ladderStatus(await gemini.get(), L.line),
        decision: { odds: L.odds?.odds ?? null },
        protected: protectedHere || !!guarded,
      },
      offers: offersFor(view),
      protectedHere,
      protection: {
        available: protector.enabled,
        why: protector.why(),
        guard: guarded && { address: guarded.guard, capUsdc: guarded.capUsdc, inLoan: guarded.inLoan, since: guarded.since, lastMove: guarded.lastMove, lastError: guarded.lastError },
      },
      demo: { pushHealth: config.pushHealth, calmHealth: config.resetHealth },
      explorer: config.explorer,
    });
  } catch (e) {
    res.status(502).json({ error: `could not read Arc Testnet: ${String((e as Error).message).split("\n")[0].slice(0, 140)}` });
  }
});

// ---- What a CONNECTED wallet can do for itself: open a loan, add savings. The server only prepares the
// transactions (to + data) after checking them against the chain. The visitor's own wallet signs and sends.
const planFor = makeWalletPlanner(config, readWalletView, walletIds, protector);
app.post("/api/plan/:action", async (req, res) => {
  if (!walletHit()) return res.status(429).json({ error: "lots of requests right now, try again in a minute" });
  try {
    res.json(await planFor(String(req.params.action), req.body ?? {}));
  } catch (e) {
    if (e instanceof PlanError) return res.status(400).json({ error: e.message });
    res.status(502).json({ error: `could not read Arc Testnet: ${String((e as Error).message).split("\n")[0].slice(0, 140)}` });
  }
});

// ---- A wallet that just signed its guard's permissions asks to be watched from now on. No key needed and
// nothing to trust: the server checks the guard on-chain (our exact contract, our bot key, both permissions)
// and would find it by itself within half a minute anyway. `refresh` drops a guard whose owner cut it off.
app.post("/api/protect", async (req, res) => {
  if (!walletHit()) return res.status(429).json({ error: "lots of requests right now, try again in a minute" });
  try {
    const loan = await protector.register(String(req.body?.guard ?? ""));
    res.json({ ok: true, guard: loan.guard, owner: loan.owner });
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message).split("\n")[0].slice(0, 200) });
  }
});
app.post("/api/protect/refresh", async (req, res) => {
  if (!walletHit()) return res.status(429).json({ error: "lots of requests right now, try again in a minute" });
  try {
    res.json({ ok: true, active: await protector.refresh(String(req.body?.guard ?? "")) });
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message).split("\n")[0].slice(0, 200) });
  }
});

// ---- alarm (b): Borrow Kit calls this when the loan's health band changes. GET/HEAD answer reachability probes.
app.get("/api/borrow-webhook", (_req, res) => res.json({ ok: true }));
app.post("/api/borrow-webhook", auth, (req, res) => {
  const b = req.body ?? {};
  console.log(`[borrow-webhook] payload: ${JSON.stringify(b).slice(0, 600)}`);   // to document what Circle sends
  const band = b.healthFactorBand ?? b.band ?? b.data?.healthFactorBand ?? b.data?.band;
  bot.wake("Borrow Kit webhook", band ? `band ${band}` : undefined);
  res.json({ ok: true });
});

// ---- alarm (c): QuickNode Stream (filter in stream/filter.js) posts matching Arc activity here.
// No key needed: this route can't move money, and every reported transaction is fetched from Arc
// and kept only if it really touches our market or wallet (src/stream-verify.mjs). With the key
// (header or ?key=) deliveries are trusted as before, which is also how the simulator is fed.
const arcClient = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl) });
const recentUnkeyed: number[] = [];
async function verifiedEvents(matches: any[]): Promise<StreamEvent[]> {
  const hashes = [...new Set(matches.map((m) => m?.tx ?? m?.transactionHash).filter(isTxHash))].slice(0, 10) as `0x${string}`[];
  const out: StreamEvent[] = [];
  for (const hash of hashes) {
    try {
      const receipt = await arcClient.getTransactionReceipt({ hash });
      const d = describeReceipt(receipt, { wallet: arc.address, marketId: arc.marketId ?? "" });
      if (d) out.push({ t: Date.now(), block: Number(receipt.blockNumber), tx: hash, kind: d.kind, detail: d.detail });
    } catch { /* unknown transaction: dropped */ }
  }
  return out;
}
app.post("/api/stream", async (req, res) => {
  const body = req.body ?? {};
  const matches: any[] = Array.isArray(body.matches) ? body.matches : Array.isArray(body) ? body : [];
  const given = String(req.get("x-airbag-key") ?? req.query.key ?? "");
  const keyed = config.webhookSecret ? safeEq(given, config.webhookSecret) : loopback(req) && !viaProxy(req);
  let events: StreamEvent[];
  if (keyed) {
    events = matches.slice(0, 50).map((m) => ({
      t: Date.now(),
      block: m.block != null ? Number(m.block) : null,
      tx: m.tx ?? m.transactionHash ?? null,
      kind: String(m.kind ?? m.event ?? "activity"),
      detail: String(m.detail ?? m.address ?? ""),
    }));
  } else {
    if (config.mode !== "live") return res.status(401).json({ error: "the simulator only accepts keyed deliveries" });
    const now = Date.now();
    while (recentUnkeyed.length && now - recentUnkeyed[0] > 60_000) recentUnkeyed.shift();
    if (recentUnkeyed.length >= 60) return res.status(429).json({ error: "too many deliveries" });
    recentUnkeyed.push(now);
    events = await verifiedEvents(matches);
    if (!events.length) return res.json({ ok: true, received: 0, note: "nothing in this delivery touches our market or wallet" });
  }
  if (events.length) store.addStream(events);
  const liquidated = events.find((e) => /OUR LOAN LIQUIDATED/.test(e.kind));
  if (liquidated) store.log("error", `QuickNode Stream saw our loan being liquidated in block ${liquidated.block ?? "?"}.`, liquidated.tx && config.mode === "live" ? [{ label: "liquidation", hash: liquidated.tx, url: `${config.explorer}/tx/${liquidated.tx}` }] : undefined);
  const kinds = [...new Set(events.map((e) => e.kind))].join(", ");
  bot.wake("QuickNode Stream", events.length ? `${events.length} match${events.length > 1 ? "es" : ""}: ${kinds}, block ${events[0].block ?? "?"}` : undefined);
  res.json({ ok: true, received: events.length });
});

// ---- demo controls (the dashboard shows them after pressing "d" and entering the key)
const demo = (fn: () => Promise<string>) => async (_req: Request, res: Response) => {
  try {
    res.json({ ok: true, result: await fn() });
  } catch (e) {
    store.log("error", `Demo action failed: ${(e as Error).message}`, (e as any)?.txs);
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
};
app.post("/api/demo/push", demoAuth("push"), demo(() => bot.demoPush()));
app.post("/api/demo/reset", demoAuth("reset"), demo(() => bot.demoReset()));
app.post("/api/demo/pause", demoAuth("pause"), (req, res) => {
  const p = req.body?.paused;
  bot.setPaused(typeof p === "boolean" ? p : !bot.paused);
  res.json({ ok: true, paused: bot.paused });
});
app.post("/api/demo/limit", demoAuth("limit"), (req, res) => {
  try {
    bot.setLimit(Number(req.body?.limit));
    res.json({ ok: true, limit: bot.limit });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});
app.post("/api/demo/check-key", demoAuth("check-key"), (_req, res) => res.json({ ok: true }));

const server = app.listen(config.port, () => {
  console.log(`Airbag dashboard: http://localhost:${config.port}  (mode: ${config.mode})`);
  bot.start();
  protector.start();
});

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    bot.stop();
    protector.stop();
    store.flush();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
