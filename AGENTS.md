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
- The QuickNode Stream `airbag-arc-testnet` delivers our loan's and wallet's activity to `/api/stream`. Verified live.

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
| `src/hedge.mjs` | Pure logic for the hedge QUOTE in the landing page's Gemini part: Gemini's price to buy "No" on a bet, and Morpho's sell-off penalty. Read-only: nothing places an order. Types in `hedge.d.mts`. |
| `src/market-history.mjs` | Pure logic for the market-over-time chart: Gemini's hourly candles for a bet → points, and which bets are worth drawing. Types in `market-history.d.mts`. |
| `src/arc.ts` | `LiveArc` (Circle App Kit + viem reads) and `SimArc` (in-memory twin). Every money move goes through here. |
| `src/bot.ts` | The loop: one run at a time, 8 s cooldown after acting, daily cap, dry run, health-only fallback. Also the demo push/reset. |
| `src/server.ts` | Express: serves the page, `/api/status`, `/api/replay`, `/api/ladders`, `/api/market-history`, `/api/gas`, `/api/borrow-webhook`, `/api/stream`, `/api/demo/*` (key-protected). `/api/gas` asks Arc MAINNET for its gas price: a read, nothing else ever touches mainnet. |
| `src/state.ts` | `data/state.<mode>.json`: log, odds samples, `inLoan`, money moved (for the cap). |
| `src/clock.ts` | Corrects a fast or slow local clock against Arc block time. |
| `src/config.ts` | All `.env` settings (documented in `.env.example`). |
| `web/` | The page's source: React + Vite + Tailwind, with its own `package.json`. `/` is the landing page (a walk-through that also explains the Gemini odds and the Arc contracts in depth), `/app/` is the app (two screens: Live demo, My loan). Charts are built on tweenly's chart kit (MIT, see `web/THIRD-PARTY.md`). |
| `public/` | What the server serves. `index.html`, `app/`, `assets/` and `build.json` are BUILT from `web/`: never edit them by hand. `classic/` is the old plain page, kept as a fallback at `/classic/`. |
| `scripts/` | Wallet, open loan, round trip, deposit, odds, webhook, tunnel. |
| `replay/` | The Feb 2026 crash replay, using the same `decide()`. |
| `stream/filter.js` | The QuickNode Streams filter (paste into QuickNode as is). |
| `src/public-demo.mjs` | When the demo buttons are open to everyone: hosted simulator with `PUBLIC_DEMO=true` only, never live. |
| `src/wallet-view.ts`, `src/wallet-math.mjs`, `web/src/wallet/core.js` | Connect wallet: a view of any wallet (USDC, cirBTC, savings, loan, odds) through `GET /api/wallet/:address`. |
| `src/wallet-plan.ts` | What a connected wallet can do for itself: open a loan, add savings. It builds the transactions (`POST /api/plan/...`) after checking them against the chain. The visitor's wallet signs; the server never does. |
| `src/protector.ts`, `src/guard-code.mjs` | Protects every wallet that turned protection on from the page (`PROTECT=true`, live only). Finds guards made for our bot key and their history from Arc's explorer, runs `decide()` for each, and acts only through that wallet's guard. One server per bot key. |
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

- [ ] **Keep the QuickNode Stream pointed at the live link.**
  - The Stream `airbag-arc-testnet` is created and verified.
  - Every time the tunnel restarts, paste the new `…/api/stream` URL that `npm run tunnel` prints into the Stream's destination (QuickNode → Streams → airbag-arc-testnet → Settings).
  - Resume the Stream if QuickNode paused it after failed deliveries.
  - Pause it when nobody is testing, since it bills per block.
- [ ] **Keep the bot wallet funded:** USDC for gas, at least 2 USDC in savings, more cirBTC for a bigger loan.
- [x] **Deploy the simulator on Render** (`docs/HOSTING.md`). Live since Nov 17, 2026 at https://airbag-demo.onrender.com (Ahmad's Render account). Since Nov 18 the README and `docs/SUBMISSION.md` point at https://airbagged.me instead: our mentor's advice is to show nothing simulated. The simulator stays as a tool for working on the page.
- [ ] **Change the Demo link on Devpost to https://airbagged.me** (it was the simulator's link).
- [ ] **Test the new page with a real wallet.** The page was rebuilt on Nov 18, 2026 (React, `web/`). Its signing code is the old page's, unchanged, and with a fake wallet it made the same requests. But nobody has signed on it yet. On https://airbagged.me with the test wallet: Connect wallet, the four steps on *My loan*, then *Push it to the edge* (the page should scroll to *Your loan*, which turns red, then Airbag saves it). If anything fails, the old page still works at `/classic/`.
- [x] **Run AirbagGuard live on Arc Testnet.** Done Nov 18, 2026 on a second test wallet: guard `0x895fa892dc4ff752ec9114760201f4751c106bf3`, links in README "Live proof".
- [x] **`src/arc.ts` can call the guard.** `USE_GUARD=true` sends saves and give-backs through it with `GUARD_BOT_KEY`. Tested live Nov 18, 2026.
- [x] **A hosted live bot in guard mode.** https://airbag-live.onrender.com runs `npm start` with `USE_GUARD=true` on a second test wallet (`0x3886…aC2e`) and holds no wallet key. Its Push and Reset come from the owner's machine (`npm run demo:push`, `npm run demo:reset`). Never start a second bot on that wallet.
- [x] **Click through protection for a connected wallet.** Done Nov 18, 2026 on https://airbagged.me (`PROTECT=true`) with a third test wallet (`0x5364…Fb53`): open a loan, add savings, turn on protection, push, the bot's save 3 s later, calm, the bot's give-back. Links in README "Live proof".
- [ ] **Press "Turn protection off" live** with that wallet (two signatures), then turn it on again. The page should reuse the same guard instead of creating a new one. Neither has been pressed live yet.
- [ ] **Switch the first bot wallet to guard mode too.** Deploy a guard for it (`npm run guard:deploy`), then where it runs set `USE_GUARD=true`, `GUARD_ADDRESS` and `GUARD_BOT_KEY`, and remove `PRIVATE_KEY`.
- [ ] **Optional:**
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
