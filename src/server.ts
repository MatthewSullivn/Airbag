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
import { Bot } from "./bot.js";
import { RULE } from "./brain.mjs";
import { describeReceipt, isTxHash } from "./stream-verify.mjs";
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

// ---- status for the dashboard (polled every 1-2 s). No secrets in here.
app.get("/api/status", (_req, res) => {
  const r = bot.last;
  const hourAgo = Date.now() - 3600_000;
  res.json({
    now: Date.now(),
    mode: config.mode,
    dryRun: config.dryRun,
    paused: bot.paused,
    explorer: config.mode === "live" ? config.explorer : null,
    wallet: { address: arc.address, ...(r?.wallet ?? {}) },
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
app.post("/api/demo/push", auth, demo(() => bot.demoPush()));
app.post("/api/demo/reset", auth, demo(() => bot.demoReset()));
app.post("/api/demo/pause", auth, (req, res) => {
  const p = req.body?.paused;
  bot.setPaused(typeof p === "boolean" ? p : !bot.paused);
  res.json({ ok: true, paused: bot.paused });
});
app.post("/api/demo/limit", auth, (req, res) => {
  try {
    bot.setLimit(Number(req.body?.limit));
    res.json({ ok: true, limit: bot.limit });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});
app.post("/api/demo/check-key", auth, (_req, res) => res.json({ ok: true }));

const server = app.listen(config.port, () => {
  console.log(`Airbag dashboard: http://localhost:${config.port}  (mode: ${config.mode})`);
  bot.start();
});

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    bot.stop();
    store.flush();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
