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
npm run sim                     # http://localhost:3000, simulated loan + live Gemini odds, no wallet needed
```

## Ground rules

1. **Testnet only.** The bot wallet is a testnet-only key. Never put a key that holds real funds in `.env`.
2. **Never commit or print secrets.**
   - `.env` (`PRIVATE_KEY`, `WEBHOOK_SECRET`), `data/` (runtime state) and `tools/` are git-ignored. Keep them that way.
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
Borrow Kit webhook ─┼─> bot.ts: read -> decide -> act -> log ──> dashboard (public/, polls /api/status)
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
| `src/arc.ts` | `LiveArc` (Circle App Kit + viem reads) and `SimArc` (in-memory twin). Every money move goes through here. |
| `src/bot.ts` | The loop: one run at a time, 8 s cooldown after acting, daily cap, dry run, health-only fallback. Also the demo push/reset. |
| `src/server.ts` | Express: dashboard, `/api/status`, `/api/replay`, `/api/borrow-webhook`, `/api/stream`, `/api/demo/*` (key-protected). |
| `src/state.ts` | `data/state.<mode>.json`: log, odds samples, `inLoan`, money moved (for the cap). |
| `src/clock.ts` | Corrects a fast or slow local clock against Arc block time. |
| `src/config.ts` | All `.env` settings (documented in `.env.example`). |
| `public/` | The dashboard: plain HTML/CSS/JS with hand-drawn SVG charts, no framework. |
| `scripts/` | Wallet, open loan, round trip, deposit, odds, webhook, tunnel. |
| `replay/` | The Feb 2026 crash replay, using the same `decide()`. |
| `stream/filter.js` | The QuickNode Streams filter (paste into QuickNode as is). |
| `src/public-demo.mjs` | When the demo buttons are open to everyone: hosted simulator with `PUBLIC_DEMO=true` only, never live. |
| `render.yaml`, `docs/HOSTING.md` | The always-on public demo (the simulator on Render). |
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
   - There is no history of odds, so we save our own samples every 15 s.
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

## Code conventions

- **Language and runtime.** TypeScript ESM run by `tsx` (no build), Node 22+.
  - TS imports use `.js` extensions (NodeNext).
  - `brain.mjs` stays dependency-free plain JS.
- **Amounts to Circle's kits** are decimal strings with at most 6 decimals: use `usdc6()`.
  - Kit results are `confirmed` / `confirmed-details-unavailable` / `submitted`; `txOf()` treats `submitted` as an error.
- **Never decide on stale data.** Read the chain first. Keep the one-run-at-a-time rule, the cooldown and the daily cap.
- **Dashboard rules.**
  - Insert server text with `textContent` only, never `innerHTML` with data.
  - Colors come from the CSS tokens in `public/style.css` (light and dark are both defined).
  - Charts keep a table view. Check phone width.
- **New behaviour gets a test** in `test/`, using the saved fixtures rather than live calls.
- **Commits.** Small commits with clear messages, pushed to `main`. Pull before you push. Scan for secrets before committing.

## What's left

- [ ] **Keep the QuickNode Stream pointed at the live link.**
  - The Stream `airbag-arc-testnet` is created and verified.
  - Every time the tunnel restarts, paste the new `…/api/stream` URL that `npm run tunnel` prints into the Stream's destination (QuickNode → Streams → airbag-arc-testnet → Settings).
  - Resume the Stream if QuickNode paused it after failed deliveries.
  - Pause it when nobody is testing, since it bills per block.
- [ ] **Keep the bot wallet funded:** USDC for gas, at least 2 USDC in savings, more cirBTC for a bigger loan.
- [x] **Deploy the public demo on Render** (`docs/HOSTING.md`). Live since Nov 17, 2026 at https://airbag-demo.onrender.com (Ahmad's Render account). The link is in `docs/SUBMISSION.md` and the README. A backup copy runs at https://airbag-demo-re8f.onrender.com (Matthew's Render account).
- [ ] **Run AirbagGuard live on Arc Testnet** (`npm run guard:deploy`, then `npm run guard:try -- 0.25`) with your own wallet and loan, and add the links to README "Live proof". Then switch `src/arc.ts` to call the guard.
- [ ] **Optional:**
  - a Swap Kit fallback when savings run out
  - longer odds history on the chart

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
