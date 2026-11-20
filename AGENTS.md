# AGENTS.md: working on Airbag

For teammates and any AI coding agent working in this repo (Cursor and Codex read this file; `CLAUDE.md` points Claude Code here). Read it before changing anything.

## What it is

Airbag protects a bitcoin-backed USDC loan on Arc Testnet.
- The loan is cirBTC collateral → USDC, through Circle's Borrow Kit (Morpho underneath).
- The bot reads the odds of BTC falling under the loan's liquidation line from Gemini's prediction-market price ladders.
- When the odds pass the user's limit (default 5%) or health drops under 1.10, it moves USDC from a savings vault (Circle's Earn Kit) into the loan.
- When things are calm, it moves the money back.
- A dashboard shows the odds, the line, health, savings, and a log of every move with explorer links.

**Status:**
- Works live on Arc Testnet: open loan, savings round trip, a bot save and a bot give-back. The transaction links are in README "Live proof".
- The Borrow Kit webhook works through a Cloudflare tunnel.
- The QuickNode Stream `airbag-arc-testnet` delivers our loan's and wallet's activity to `/api/stream`. Verified live. A second Stream, `airbag`, delivers to the hosted bot at `https://airbagged.me/api/stream` (since Nov 19, 2026).
- Gemini's live feed (a public WebSocket) wakes the bot when a bet's price moves, and the page shows the number being made from it. Live on the hosted bot since Nov 19, 2026.

## Quick start

```bash
npm install
npm test && npm run typecheck   # run both before every commit
npm run sim                     # http://localhost:3000 (landing) and /app/ (the app): simulated loan + live Gemini odds, no wallet needed
```

## Ground rules

1. **Testnet only.** The bot wallet is a testnet-only key. Never put a key that holds real funds in `.env`.
2. **Never commit or print secrets.**
   - `.env` (`PRIVATE_KEY`, `GUARD_BOT_KEY`, `WEBHOOK_SECRET`), `data/` (runtime state) and `tools/` are git-ignored. Keep them that way.
   - Agents: don't echo `.env` values into chat, logs, commits or docs.
   - Share the team key privately, if at all.
3. **One live bot per wallet.** Two `npm start` processes on the same wallet would both repay. Use `npm run sim` for UI work, and `DRY_RUN=true` to try rule changes against the live loan.
4. **Don't document what wasn't tested.** When you verify something live, add it to README "Live proof" / "What is verified" with explorer links.
5. **Leave `src/brain.test.mjs` unchanged** (it's the original spec). Add new checks in `test/`.
6. **`PUBLIC_DEMO` must never open the live bot.** `publicDemoOn()` checks the mode; `test/public-demo.test.mjs` covers it. Keep both.
7. **If you change the rule** (`RULE` thresholds or the odds math), run `npm run replay:run` and update the replay table in README §7.

## How it works

```
timer (5 s) ────────┐
Gemini live feed ───┤
Borrow Kit webhook ─┼─> bot.ts: read -> decide -> act -> log ──> the page (web/ built into public/, polls /api/status)
QuickNode Stream ───┤        │        │         │
demo buttons ───────┘        │        │         └─ Circle App Kit: earn.withdraw -> borrow.repay   (save)
                             │        │                            borrow.borrow  -> earn.deposit  (give back)
                             │        └─ brain.mjs decide(): odds > limit or health < 1.10 -> repay
                             └─ Morpho position + oracle and vault shares (on-chain), Gemini ladders + BTC price
```

**The rule** (`decide()` in `src/brain.mjs`):
- **Act** when odds > limit or health < 1.10.
- **Repay** down to the safer of health 1.25 or the highest line whose odds are under the limit.
- **Give back** only when odds are under half the limit and health is above 1.40, never below 1.30. This band prevents flip-flopping, and a test covers it.

**The odds:**
- **Chance per bet.** The middle of bid and ask gives the chance BTC ends above each strike.
- **Chance below the line.** Interpolate between bets to get the chance BTC ends below the line, then ×2 for "touches the line any time" (capped at 100%).
- **Below the lowest bet,** a log-normal is fitted to the ladder; these odds are labelled "estimated".
- **Several ladders:** the bot uses the worst odds.

| File | What it does |
|---|---|
| `src/brain.mjs` | Pure logic, no dependencies: ladder → odds, estimated tail, worse-of-ladders, `decide()`. Types in `brain.d.mts`: keep the two in sync. |
| `src/gemini.ts` | Ladders (cached 20 s), discovering new BTC ladders when ours expire, live BTC price. |
| `src/gemini-live.mjs` | Pure logic for Gemini's LIVE feed (`wss://ws.gemini.com`): what a message means, a bet's chance from its bid and ask (the same way `brain.mjs` reads REST), laying the feed's prices over a ladder, the price of a "No". Shared by the server, the page and the tests. Types in `gemini-live.d.mts`. |
| `src/gemini-feed.ts` | The server's socket to that feed. It only says WHEN to look: on a price move the kept ladders are thrown away and the bot is woken, then it reads REST and decides as always. Settles 1.5 s, at most every 4 s, restarts the bot's 5 s timer. `GEMINI_FEED=false` turns it off. |
| `src/hedge.mjs` | Pure logic for the hedge: Gemini's price to buy "No" on a bet, Morpho's sell-off penalty, the quote (`hedgeQuote`) and the quote as an order for Gemini's API (`hedgeOrder`). The page shows it; with a test key the bot places it. Types in `hedge.d.mts`. |
| `src/gemini-sign.mjs`, `src/gemini-trade.ts` | A signed request for Gemini's private REST API, and the client that places, lists and cancels prediction market orders. It can reach Gemini's TEST site only (`api.sandbox.gemini.com` is a constant, and a test checks it). Gemini's order numbers are too long for a JavaScript number: they travel as text. |
| `src/hedger.ts` | With `GEMINI_SANDBOX_KEY` and `GEMINI_SANDBOX_SECRET` set: after each save (the bot's own loan and connected wallets') it places the hedge on Gemini's test site, and cancels what is open of it when the loan is calm. Every failure is caught and logged; it never touches a save. Without a key nothing runs. |
| `src/calibration.mjs`, `scripts/gemini-calibration.mjs` | The check of Gemini's settled bitcoin ladders against what happened (`npm run calibration`, about 10 minutes, public data). Writes `replay/gemini-calibration.json` and the summary the page shows (`web/src/recorded/gemini-calibration.json`: rebuild the page after a new run). |
| `src/market-history.mjs` | Pure logic for the market-over-time chart: Gemini's hourly candles for a bet → points, and which bets are worth drawing. Types in `market-history.d.mts`. |
| `src/crash-test.mjs` | Pure logic for the landing page's crash test: the few facts of February's replay it draws (the ride day by day, Airbag's first move, the sale, what was left). `test/crash-test.test.mjs` holds them to `replay/results.json`, so a re-run replay can't leave the picture saying something old. Types in `crash-test.d.mts`. On the page, `?crash=with` or `?crash=without` holds a run's ending, and `&t=1.9` a moment of it (seconds), for pictures. |
| `src/arc.ts` | `LiveArc` (Circle App Kit + viem reads) and `SimArc` (in-memory twin). Every money move goes through here. |
| `src/bot.ts` | The loop: one run at a time, 8 s cooldown after acting, daily cap, dry run, health-only fallback. Also the demo push/reset. |
| `src/server.ts` | Express: serves the page, `/api/status`, `/api/replay`, `/api/ladders`, `/api/market-history`, `/api/gas`, `/api/borrow-webhook`, `/api/stream`, `/api/demo/*` (key-protected). `/api/gas` asks Arc MAINNET for its gas price: a read, nothing else ever touches mainnet. |
| `src/state.ts` | `data/state.<mode>.json`: log, odds samples, `inLoan`, money moved (for the cap). |
| `src/clock.ts` | Corrects a fast or slow local clock against Arc block time. |
| `src/config.ts` | All `.env` settings (documented in `.env.example`). |
| `web/` | The page's source: React + Vite + Tailwind, with its own `package.json`. `/` is the landing page (it opens with a crash test, `crash-test.tsx`: February 2026's replay as a car and a wall, with and without Airbag; then a walk-through that also explains the Gemini odds and the Arc contracts in depth), `/app/` is the app (two screens: Live demo, My loan). Both app screens show a loan as two charts, `ArcNow` (the money on Arc, with Arc's block counted live from its public RPC) and `LiveOdds` (how the number is made right now from Gemini's live feed, `web/src/lib/gemini-feed.ts`). On the live site the Live demo's loan cannot be pushed from the page (the server holds no owner key), so it has a bar saying so and `WhatIf`: a push on paper and a limit slider that run `decide()` on the page and change nothing. Charts are built on tweenly's chart kit (MIT, see `web/THIRD-PARTY.md`). |
| `public/` | What the server serves. `index.html`, `app/`, `assets/` and `build.json` are BUILT from `web/`: never edit them by hand. `classic/` is the old plain page, kept as a fallback at `/classic/`. |
| `scripts/` | Wallet, open loan, round trip, deposit, odds, webhook, tunnel. |
| `replay/` | The Feb 2026 crash replay, using the same `decide()`. |
| `stream/filter.js` | The QuickNode Streams filter (paste into QuickNode as is). |
| `src/public-demo.mjs` | When the demo buttons are open to everyone: hosted simulator with `PUBLIC_DEMO=true` only, never live. |
| `src/wallet-view.ts`, `src/wallet-math.mjs`, `web/src/wallet/core.js` | Connect wallet: a view of any wallet (USDC, cirBTC, savings, loan, odds) through `GET /api/wallet/:address`. |
| `src/wallet-plan.ts` | What a connected wallet can do for itself: open a loan, add savings. It builds the transactions (`POST /api/plan/...`) after checking them against the chain. The visitor's wallet signs; the server never does. |
| `src/protector.ts`, `src/guard-code.mjs` | Protects every wallet that turned protection on from the page (`PROTECT=true`, live only). Finds guards made for our bot key and their history from Arc's explorer, runs `decide()` for each, and acts only through that wallet's guard. One server per bot key. |
| `src/one-at-a-time.mjs` | Makes sure the check of connected wallets' loans never runs twice at once, whether the timer or a QuickNode Stream delivery starts it. A delivery that arrives during a check is followed by one more check. |
| `src/guard-search.mjs` | Finds the guards made for our bot key straight from Arc's RPC (`BotChanged` events), in ranges of 5,000 blocks, one request at a time. Pure logic: the caller passes in the function that asks the chain. |
| `contracts/AirbagGuard.artifact.json` | The guard's ABI and bytecode, committed so hosts without Foundry can deploy and recognise it. Regenerate with `npm run guard:artifact` whenever the contract changes. |
| `src/guard-plan.mjs` | Guard mode's pure checks: which key setups may run, and clamping a move to the guard's on-chain cap. `LiveArc` uses them when `USE_GUARD=true`. |
| `render.yaml`, `docs/HOSTING.md` | The simulator hosted on Render. A tool for working on the page: the submission points only at the real loan on https://airbagged.me. |
| `contracts/` | `AirbagGuard`: a contract so the bot key can only move the owner's savings into the owner's own loan and back. Foundry. See `contracts/README.md`. |
| `test/` | Brain checks on saved real Gemini ladders (`test/fixtures/`) and filter tests. |

## Commands

```bash
npm start                   # LIVE bot + dashboard on Arc Testnet (needs .env)
npm run tunnel              # public https link via cloudflared; re-registers the Borrow Kit webhook
npm run odds                # live odds for a range of health levels
npm run hedge:test          # the hedge on Gemini's TEST site: shows the order and sends nothing (-- --send places it, -- --orders lists them)
npm run calibration         # re-read Gemini's settled bitcoin ladders and score their odds (about 10 minutes)
npm run loan:show           # loan, savings, wallet
npm run balances            # wallet USDC + cirBTC
npm run roundtrip -- 0.25   # live savings round trip (moves 0.25 USDC both ways)
npm run savings:deposit -- 5
npm run replay              # re-fetch prices and re-run the crash replay
npm run wallet:new          # a fresh wallet into .env (only for a new setup)
npm run loan:open           # one loan per wallet per market
npm run guard:test          # AirbagGuard's Foundry tests (needs Foundry)
npm run guard:deploy        # deploy AirbagGuard (run guard:build first); see contracts/README.md
npm run guard:limits        # show the guard's cap and health floor; -- 200 sets the cap (owner only)
npm run demo:push           # owner's machine: push the loan to the edge when the server holds no wallet key
npm run demo:reset          # owner's machine: repay from the wallet back to a calm loan
npm run web:install         # once: the page's own packages (web/node_modules)
npm run web:build           # rebuild the page into public/ after changing web/ (commit public/ too)
npm run web:dev             # the page with live reload on http://localhost:5173 (needs npm run sim running)
```

**Demo controls.** Press **d** on the dashboard and enter `WEBHOOK_SECRET`.
- *Push it to the edge* borrows up to Borrow Kit's max.
- *Reset* repays from the wallet to health 1.5; the bot then gives savings back by itself.
- *Pause* and *Limit* are also there.

**The tunnel** needs `tools/cloudflared.exe` (Cloudflare's official release; check its SHA256 against the release notes) or `cloudflared` on PATH.

## Key facts (Arc Testnet, all public)

| | |
|---|---|
| Chain | chain id `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io` |
| Borrow Kit market cirBTC→USDC (Morpho id, LLTV 0.86) | `0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58` |
| Morpho Blue | `0x65f435eb4ff05f1481618694bc1ff7ee4680c0a4` |
| Market oracle (fixed 75,000) | `0x917E3d9F366B0561c13155BECdBC8d79E4ED7BA3` |
| cirBTC (8 decimals) / USDC ERC-20 view (6 decimals) | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` / `0x3600000000000000000000000000000000000000` |
| Savings vault "EarnKit USDC Vault (Arc Testnet)" | `0xaabbef1d3971c710276ed41ec791bbe14cdb8e88` |
| Bot wallet / loan id | `0xF6B5177872Fc12DCBcE76d023e96988fB7Fa3F0C` / `e4c53980-53a9-5564-a385-73ba1ac933f9` |
| Gemini ladders | `BTC2611302200` (Nov 30, main) and `BTC2611202200` (Nov 20). Pattern `BTC<YYMMDD>2200`. |
| Faucet | https://faucet.circle.com (Arc Testnet): 20 USDC per request; 0.0001 cirBTC per wallet every 2 h |

Check the current loan state with `npm run loan:show`.

## Lessons learned the hard way

Read these before touching `src/arc.ts`.

1. **Use the `/next` adapter.** `@circle-fin/adapter-viem-v2/next`, not the root import. Borrow Kit needs an atomic batch, which a plain wallet can only send through Arc's batcher. The root import fails with `INPUT_UNSUPPORTED_ACTION`.
2. **The local clock breaks Borrow Kit writes.** Borrow Kit signs writes with a deadline about 2 min out and checks it against `Date.now()`. A fast clock (ours was +157 s) makes every write fail with "execution deadline has expired". `src/clock.ts` corrects for it; syncing the OS clock is the real fix.
3. **A failed opening still creates a loan id.** It shows `PENDING` with null numbers. Finish it with `borrow({ loanId })`; `loan:open` does this.
4. **Borrow Kit's `getPosition` can be stale.** Right after a repay it returned `READY` with the old debt, which could make the bot repay twice. We read the loan from Morpho (`position`, `market`, oracle `price()`) and savings from the vault (`balanceOf` → `convertToAssets`). Earn Kit's position also lagged after deposits. The kit reads are only fallbacks.
5. **The testnet oracle price is fixed at $75,000**, while real BTC was about $64k. With `PRICE_SOURCE=real` (the default) the bot values collateral at Gemini's live BTC price; the dashboard shows both health numbers.
6. **Borrow Kit lends only up to on-chain health ≈ 1.236** (about 70% LTV). That is health ≈ 1.06 at the live price, so "push" lands at odds of about 42–50%.
   - The on-chain band can't drop below `SAFE` through the kit, so Borrow Kit's band-change webhook won't fire from demo pushes.
7. **Opening a loan takes only the collateral the kit's cap needs.** `loan:open` then `addCollateral`s the rest. Borrow-more may also pull free cirBTC from the wallet.
8. **The vault's `maxWithdraw` returns 0.** That is the Morpho Vault V2 design (`MORPHO()` also reverts). `kit.earn.withdraw` works anyway.
9. **Gemini API quirks.**
   - Contracts are unsorted; use `strike: { type, value }`.
   - The event listing is paged (`offset`).
   - The prediction-markets endpoints have no history of odds, so we save our own samples every 15 s.
   - But every bet has hourly candles on the normal market-data API: `GET /v2/candles/<instrumentSymbol>/1hr` (for example `GEMI-BTC2611302200-HI65000`). They start at the bet's first trade and hold the last TRADED price, not the bid/ask middle the bot uses. The landing page's Gemini part draws them (`/api/market-history`). Found Nov 18, 2026.
10. **Tunnel quirks.**
    - A new `trycloudflare.com` link can take about a minute to resolve.
    - It changes on every restart: re-run `npm run tunnel` and update the QuickNode destination.
    - Tunnel traffic arrives from localhost, so auth ignores loopback when proxy headers are present.
11. **Windows quirks.** `node --test` needs a quoted glob (`"test/**/*.test.mjs"`). Git's LF→CRLF warnings are harmless.
12. **The QuickNode filter must stay a plain script** (no `import`/`export`). The test loads it the same way QuickNode does.
    - QuickNode hands it `{ data: [{ block, receipts }] }` in batches of 5 blocks (the minimum on Arc).
13. **`/api/stream` needs no key, by design.**
    - It can't move money, and it re-checks every delivery against the transaction receipt on Arc (`src/stream-verify.mjs`), so fake or mislabelled deliveries are dropped.
    - Keep it that way: don't put `WEBHOOK_SECRET` in third-party URLs.
    - The savings vault (Morpho Vault V2) doesn't emit standard ERC-4626 events, so its moves show up as "bot wallet transaction".
14. **MetaMask flags `onrender.com` links.** Connecting a wallet on `airbag-live.onrender.com` showed MetaMask's "malicious site" warning. Its site check returned BLOCK for every `onrender.com` name we tried (and for names on `vercel.app`, `netlify.app` and `github.io`), so it is the suffix, not our page.
    - The hosted live bot has its own domain for that reason: https://airbagged.me (the same Render service, Matthew's account). The check returns nothing for it.
    - Use that link for anything with Connect wallet. The simulator needs no wallet, so its `onrender.com` link is fine.
15. **Arc's public RPC limits log searches.** `eth_getLogs` over 10,000 blocks is refused (`requested range too large`); 5,000 is answered. Twenty searches in 7 seconds, four at a time, got `Request exceeds defined limit`. One at a time with a short pause, ten per pass, went through. `src/guard-search.mjs` works that way.
16. **The hosted bot forgets connected wallets on every restart** and has to find their guards again. Every push to `main` and every wake-up from sleep is a restart. Before a live push from a connected wallet, check that the page says protection is on.
17. **Gemini's live feed** (found and measured Nov 19, 2026).
    - `wss://ws.gemini.com`, public, no key. Send `{ id, method: "SUBSCRIBE", params: ["<bet>@bookTicker", "<bet>@trade"] }`; the reply is `{ id, status: 200 }`. One message took all 33 bets of both ladders (66 streams), and every bet answered at once with its current prices.
    - A quote is `{ s, b, B, a, A, c, C }`: the symbol in LOWER case, best bid and ask of "Yes" as text (`"0.8400"`), their sizes, and the last trade. An empty text means nobody quotes that side: it is not zero.
    - Its bid and ask equalled REST's `prices.bestBid` and `bestAsk` for all 33 bets. REST's `prices.buy.no` is 1 minus the best bid; with no bid it falls back to 1 minus the last trade, which nobody is actually selling at.
    - Gemini closes a socket that does not answer its pings for 60 s. Node's built-in `WebSocket` and browsers answer by themselves: a Node connection was still open after 100 s.
    - It works from a browser page too, and so does Arc's public RPC (`eth_getBlockByNumber` from the page: that is the live block number in `ArcNow`).
    - No trade happened while we listened (25 minutes on both ladders, 12,606 price updates), so `readMessage`'s trade branch follows Gemini's documentation, not a recording.
18. **Gemini's test site trades prediction markets** (tried Nov 19, 2026). Our earlier notes said the sandbox does not cover them. It does.
    - Account: `https://exchange.sandbox.gemini.com/register`. It sends no codes: Gemini's docs give the test switch (the cookie `GEMINI-SANDBOX-2FA=true`, then the code `9999999`). A new account starts with test dollars. Key: Settings > API, role Trading, time based nonce.
    - A private call: the JSON payload holds `request` (the path), `nonce` and the call's fields; it goes Base64-encoded in `X-GEMINI-PAYLOAD` with an empty body; `X-GEMINI-SIGNATURE` is the hex HMAC-SHA384 of that Base64 text. A time based nonce is Unix seconds within 30 s of Gemini's clock, so `gemini-trade.ts` takes the time from Gemini's own `Date` header, not the local clock.
    - Calls that worked: `GET /v1/prediction-markets/terms/status`, `POST /v1/prediction-markets/order`, `/orders/active`, `/orders/history`, `/positions`. `POST /order/cancel` is written from the docs and has not run yet (both our orders filled at once).
    - The test site lists FEWER bets than the real one (Nov 30 market: 8 of 12, from $67,500), and an order for a bet it lacks is refused with `SymbolNotFound`. So the order's bet must come from the test site's own list, with the real market's price as the limit.
    - Order numbers are 64-bit (`145853902322727138`): `JSON.parse` rounds them. Keep them as text (`parseKeepingLongNumbers`, `wholeNumber` in `gemini-sign.mjs`).
    - Its book has resting orders: our limit of 84¢ for a "No" was filled at 68¢.
    - Accepting Gemini's terms is the account owner's call: only `npm run hedge:test -- --accept-terms` does it, never the bot.

## Code conventions

- **Language and runtime.** The server is TypeScript ESM run by `tsx` (no build), Node 22+. Only the page is built (see "The page" below).
  - TS imports use `.js` extensions (NodeNext).
  - `brain.mjs` stays dependency-free plain JS.
- **Amounts to Circle's kits** are decimal strings with at most 6 decimals: use `usdc6()`.
  - Kit results are `confirmed` / `confirmed-details-unavailable` / `submitted`; `txOf()` treats `submitted` as an error.
- **Never decide on stale data.** Read the chain first. Keep the one-run-at-a-time rule, the cooldown and the daily cap.
- **The page** (`web/`).
  - After changing anything in `web/`: `npm run web:build`, then commit `public/` too. `npm test` fails if the build is older than the source. The first time: `npm run web:install`.
  - Use `npm run web:install` (a plain `npm install`). `npm ci` inside `web/` refuses the lockfile: an npm bug with the optional WASM builds of Tailwind and Rolldown.
  - Never name a folder under `web/src` `data`: the repo ignores every `data/` folder, so its files would build here and never reach GitHub (it happened; a test now catches it).
  - The built files are committed on purpose. Render runs `npm ci` and serves `public/` as it is, so the server needs nothing from `web/`. Keep it that way: no frontend package in the root `package.json`.
  - `web/src/wallet/core.js` is the signing logic. It was proven on-chain and cannot be re-tested without a person signing. Do not rewrite it.
  - Never put server text into the page as HTML (no `dangerouslySetInnerHTML`).
  - Colors come from the tokens in `web/src/styles.css` (light and dark are both defined). Chart series colors are in `web/src/charts/xy-chart.tsx`.
  - Charts keep a table view. Check phone width.
  - Few words. One idea per screen. `?still` in the address turns animations off for screenshots.
- **New behaviour gets a test** in `test/`, using the saved fixtures rather than live calls.
- **Commits.** Small commits with clear messages, pushed to `main`. Pull before you push. Scan for secrets before committing.

## What's left

- [ ] **Confirm on the hosted bot that it finds guards by itself after a restart.** On Nov 19, 2026 it did not: 12 minutes after a restart `protector.loans` was still empty (the explorer's `getLogs` answered the same search from another machine at once), and the wallet was only watched again when its owner opened the page (`use-wallet.ts` posts the remembered guard to `/api/protect`). Since then the bot also searches Arc's RPC itself (`src/guard-search.mjs`, `discoverOnChain()` in `src/protector.ts`). To confirm: after a restart, `GET /api/status` should list the test wallet's guard under `protector.loans` within a minute, with nobody opening the page. If the explorer search still fails, the service's log says `[protector] could not search for guards`.
- [x] **A Stream delivery about a connected wallet, live.** Nov 19, 2026, 01:29 UTC on https://airbagged.me: the push from the third test wallet was delivered one second after it landed (`connected wallet: borrow`, block 72,941,932) and the bot's save was in block 72,941,938, 3 s after the push. Links in README "Live proof". The log shows the bot's own wake-up line; the protector writes none, so that the delivery (and not the 10 s timer) triggered the save is likely, not proven.
- [x] **Gemini's live feed wakes the hosted bot.** Seen Nov 19, 2026, 02:12 UTC, a minute after it reached `main`: `GET https://airbagged.me/api/status` showed `bot.geminiFeed` as `live` with 33 bets (368 updates, 202 price moves in the first minute), `bot.lastWake.reason` was "Gemini's live feed", the bot checked every 4 s with no error, and the page's bot line said "woken by Gemini's live feed". No save has been started by such a wake-up there yet. If Render ever blocks the socket, the bot just keeps reading every 20 s.
- [ ] **Press the buttons of the rebuilt My loan screen with a real wallet.** Since Nov 19, 2026 a set-up wallet sees one slim bar (*Push it to the edge*, *Calm it down*) above its whole loan instead of the four steps. The calls are the same as step 4's (`wallet.run("push")`, `wallet.run("calm")`), but nobody has signed from the bar yet. *The steps* opens the old steps.
- [x] **The hedge as a real test order.** Nov 19, 2026 on Gemini's test site: one order by hand and one by the bot a second after a simulated save, both filled (README "Live proof").
- [x] **The hosted bot has the test key.** Set in Render on Nov 19, 2026 (03:40 UTC): `GET https://airbagged.me/api/status` shows `hedge.enabled: true`, and the log says "A Gemini sandbox key is set". Still to see: a hedge after a save of a real loan (it shows under *What Airbag did* and as `hedge.last`).
- [ ] **See an open hedge order cancelled.** `Hedger.calm()` cancels what is open when the savings go back. Both test orders filled at once, so the cancel call has not run against Gemini yet.
- [ ] **Keep the QuickNode Stream pointed at the live link.**
  - The Stream `airbag-arc-testnet` is created and verified.
  - Every time the tunnel restarts, paste the new `…/api/stream` URL that `npm run tunnel` prints into the Stream's destination (QuickNode → Streams → airbag-arc-testnet → Settings).
  - Resume the Stream if QuickNode paused it after failed deliveries.
  - Pause it when nobody is testing, since it bills per block.
- [ ] **Keep the bot wallet funded:** USDC for gas, at least 2 USDC in savings, more cirBTC for a bigger loan.
- [x] **Deploy the simulator on Render** (`docs/HOSTING.md`). Live since Nov 17, 2026 at https://airbag-demo.onrender.com (Ahmad's Render account). Since Nov 18 the README and `docs/SUBMISSION.md` point at https://airbagged.me instead: our mentor's advice is to show nothing simulated. The simulator stays as a tool for working on the page.
- [ ] **Change the Demo link on Devpost to https://airbagged.me** (it was the simulator's link).
- [x] **The new page signed with a real wallet.** Done Nov 19, 2026 (00:16 UTC) on https://airbagged.me with the third test wallet (`0x5364…Fb53`): connect, *Push it to the edge* with one signature, and the bot's save 6 s later through that wallet's guard. Links in README "Live proof".
- [ ] **Still to press on the new page:** *Calm it down*, and steps 1 to 3 (open a loan, add savings, turn on protection). Its signing code is the old page's, unchanged, and the old page still works at `/classic/`.
- [x] **Run AirbagGuard live on Arc Testnet.** Done Nov 18, 2026 on a second test wallet: guard `0x895fa892dc4ff752ec9114760201f4751c106bf3`, links in README "Live proof".
- [x] **`src/arc.ts` can call the guard.** `USE_GUARD=true` sends saves and give-backs through it with `GUARD_BOT_KEY`. Tested live Nov 18, 2026.
- [x] **A hosted live bot in guard mode.** https://airbag-live.onrender.com runs `npm start` with `USE_GUARD=true` on a second test wallet (`0x3886…aC2e`) and holds no wallet key. Its Push and Reset come from the owner's machine (`npm run demo:push`, `npm run demo:reset`). Never start a second bot on that wallet.
- [x] **Click through protection for a connected wallet.** Done Nov 18, 2026 on https://airbagged.me (`PROTECT=true`) with a third test wallet (`0x5364…Fb53`): open a loan, add savings, turn on protection, push, the bot's save 3 s later, calm, the bot's give-back. Links in README "Live proof".
- [ ] **Press "Turn protection off" live** with that wallet (two signatures), then turn it on again. The page should reuse the same guard instead of creating a new one. Neither has been pressed live yet.
- [ ] **Switch the first bot wallet to guard mode too.** Deploy a guard for it (`npm run guard:deploy`), then where it runs set `USE_GUARD=true`, `GUARD_ADDRESS` and `GUARD_BOT_KEY`, and remove `PRIVATE_KEY`.
- [ ] **Optional:**
  - a limit per connected wallet (today `USER_LIMIT` is one limit for every loan the server protects; the page's what-if only previews other limits)
  - a Swap Kit fallback when savings run out
  - longer history of our own number on the chart (the market's own history is there now, from Gemini's candles)

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `execution deadline has expired` | The local clock is off: sync it. Check the `[clock]` line at startup. |
| `INPUT_UNSUPPORTED_ACTION` on borrow | Wrong adapter import: use `/next`. |
| `LOAN_ALREADY_EXISTS` or loan stuck `PENDING` | Run `npm run loan:open` again; it finishes an expired opening. |
| `BALANCE_INSUFFICIENT_GAS` | Wallet USDC too low: faucet, or lower `GAS_RESERVE_USDC`. |
| "Odds unavailable" | Gemini is unreachable or the ladders expired. The bot uses the health rule; discovery picks new ladders. |
| Demo buttons "Locked" / 401 | Enter `WEBHOOK_SECRET` from `.env`. |
| Port 3000 in use | Another server is running, maybe the live bot. Don't start a second one. |
| Tunnel link doesn't resolve | Wait about a minute; check the tunnel terminal is still running. |
