# AGENTS.md: working on Airbag

This file is for the team and for any AI coding agent the team uses (Cursor, Codex, Claude Code: `CLAUDE.md` points here). Read it before changing anything.

`README.md` is written for the judges. This file is how we work.

## In one minute

- **What it is.** Airbag protects a bitcoin-backed USDC loan on Arc.
  - It reads the odds of bitcoin falling under the loan's liquidation line from Gemini's prediction market.
  - When the odds pass the user's limit (default 5%), it moves USDC from a savings vault into the loan, then moves it back when calm.
  - There is no approve button.
- **Status (Nov 17, 2026, evening).**
  - Works live on Arc Testnet: loan opened, savings round trip, and a bot save in 4 s on-chain. The transaction links are in README "Live proof".
  - The Borrow Kit webhook is registered and reached us through a tunnel. The QuickNode Stream is **not created yet**.
- **Deadline.** Friday Nov 20, **12:00 PM CST**, on Devpost (`ubc-hackathon-2026.devpost.com`). Submit early.
- **Fastest way to see it.** `npm install && npm run sim`, then open http://localhost:3000. Simulated loan, live Gemini odds, no wallet needed.
- **Before every commit.** `npm test && npm run typecheck`.

## The hackathon rules that shape the work

From the organizers' guide (UBC 2026 Hackathon Guide; the team has the PDF).

**Our entry.**
- **Main track:** DeFi and Onchain Applications (exactly one main track).
- **Chain award:** Best use of Arc (never both Arc and Solana).
- **Bounties:** Gemini Prediction Markets and QuickNode Streams. ElevenLabs and Grok Bot don't fit: both require the tool to be central, not an add-on.

**Possible stack.** All of these can stack:
- DeFi Track Winner $2,000
- Best use of Arc $1,000
- Gemini 1st/2nd/3rd: $2,500 / $1,000 / $500
- QuickNode $500
- Official UBC Winner 1st/2nd/3rd: $2,500 / $1,000 / $500, automatic for every submission

**The finalist route that matters most.** The **1st place Gemini team is automatically a finalist**. Keep the Gemini odds front and centre: the big number on the dashboard, and the odds chart over time.

**Requirements we must keep true.** Each maps to where it lives:

| Requirement | Where |
|---|---|
| DeFi: interacts with smart contracts (testnet ok) | Borrow Kit / Earn Kit / Morpho on Arc Testnet |
| DeFi: economic design + risk assumptions in README | README §4, §5 |
| DeFi + Arc: addresses of every contract used | README §3 table |
| Arc: core on-chain functionality on Arc, README explains how Arc is used | README §3 |
| Gemini: uses the Prediction Markets API | `src/gemini.ts`, `src/brain.mjs`, README §2 |
| QuickNode: Streams is a core data source; one Stream with a filter + destination; README explains network, dataset, filter logic, destination and why | `stream/filter.js`, README §6. **The Stream itself still has to be created.** |
| Built during the hackathon; AI tools allowed | README §9 says what we used |

**What to submit on Devpost:**
- name, short description, all team members
- track, chain award and bounties, and opt in to each prize
- written answers to: What did you build / problem / how / unique / next
- the sponsor tools used
- the public GitHub repo with setup steps
- a working demo
- a **2–3 min video on YouTube or Google Drive**, viewable by judges
- the README with architecture

Drafts: [docs/SUBMISSION.md](docs/SUBMISSION.md), [docs/DEMO.md](docs/DEMO.md).

**Judging.**
- Judges look at technical execution, product & UX, innovation, impact & potential, and the demo.
- Finalists are told by Fri Nov 20, 11:59 PM CST. Judging is in person on Sat Nov 21: 5 min pitch + 2 min Q&A.
- **Teams must be present in person at the closing ceremony to receive any prize.**

**Perks.** QuickNode credits: follow the "QuickNode Credits Guide" in the hackathon guide. Questions: the UBC Telegram, office hours (links in the guide).

## Ground rules (humans and agents)

1. **Testnet only.** The bot wallet is a fresh testnet key. Never put a key that holds real funds in `.env`.
2. **Never commit or paste secrets.**
   - `.env` (`PRIVATE_KEY`, `WEBHOOK_SECRET`), `data/` (holds `stream-webhook-url.txt`, whose URL includes the key) and `tools/` are git-ignored. Keep it that way.
   - Agents: don't print `.env` values into chat, logs, commits, issues or docs.
   - To share the bot key with a teammate, do it privately, never in the group chat.
3. **One live bot per wallet.** Two `npm start` processes on the same wallet would both repay. Use `npm run sim` for UI work, and `DRY_RUN=true` to try a rule change against the live loan.
4. **Don't claim what we didn't test.** Judges forgive "not done yet", but not numbers that fall apart. When you verify something live, add it to README "Live proof" / "What is verified" with explorer links.
5. **Keep the plan's original brain test unchanged** (`src/brain.test.mjs`). Add new checks in `test/`.
6. **If you change the rule** (`RULE` thresholds, odds math), run `npm run replay:run` and update the replay table in README §7 from the new output.

## How it works

```
timer (5 s) ─┐
Borrow Kit webhook ─┼─> bot.ts: read -> decide -> act -> log ──> dashboard (public/, polls /api/status)
QuickNode Stream ───┤        │        │         │
demo buttons ───────┘        │        │         └─ Circle App Kit on Arc: earn.withdraw -> borrow.repay
                             │        │                                    borrow.borrow  -> earn.deposit
                             │        └─ brain.mjs decide(): odds > limit or health < 1.10 -> repay
                             └─ Morpho position + oracle (on-chain), vault shares, Gemini ladders + BTC price
```

| File | What it does |
|---|---|
| `src/brain.mjs` | Pure logic, no dependencies. Gemini ladder → odds; the estimated tail below the lowest bet; worse-of-ladders; `decide()`. Types in `brain.d.mts`: keep them in sync. |
| `src/gemini.ts` | Fetches and caches ladders (20 s), discovers new BTC ladders when ours expire, live BTC price. |
| `src/arc.ts` | `LiveArc` (Circle App Kit + viem reads on Arc Testnet) and `SimArc` (in-memory twin). Every money move goes through here. |
| `src/bot.ts` | The loop. One run at a time, 8 s cooldown after acting, daily cap, dry run, health-only fallback. Also the demo push/reset. |
| `src/server.ts` | Express. Dashboard, `/api/status`, `/api/replay`, `/api/borrow-webhook`, `/api/stream`, `/api/demo/*` (key-protected). |
| `src/state.ts` | `data/state.<mode>.json`: log, odds samples, `inLoan`, money moved (for the cap). |
| `src/clock.ts` | Corrects a fast or slow local clock against Arc's block time (see lessons). |
| `src/config.ts` | All `.env` settings. |
| `public/` | The dashboard: plain HTML/CSS/JS + hand-drawn SVG charts, no framework. |
| `scripts/` | One-off steps: wallet, open loan, round trip, deposit, odds, webhook, tunnel. |
| `replay/` | The Feb 2026 crash replay, using the same `decide()`. |
| `stream/filter.js` | The QuickNode Streams filter (paste into QuickNode as is). |
| `test/` | Extra brain checks on saved real ladders + filter tests. |

## Commands

```bash
npm install
npm test                    # 19 checks (plan's brain test + test/*.test.mjs)
npm run typecheck
npm run sim                 # dashboard with a simulated loan, live Gemini odds
npm start                   # LIVE bot + dashboard on Arc Testnet (needs .env)
npm run tunnel              # public https link via cloudflared; re-registers the Borrow Kit webhook
npm run odds                # live odds for a range of health levels
npm run loan:show           # loan, savings, wallet
npm run balances            # wallet USDC + cirBTC
npm run roundtrip -- 0.25   # live savings round trip (moves 0.25 USDC both ways)
npm run savings:deposit -- 5
npm run replay              # re-fetch prices + re-run the crash replay
```

Use `npm run loan:open` only for a new wallet; one loan per wallet per market.

**Demo controls.** On the dashboard press **d** and enter `WEBHOOK_SECRET`.
- *Push it to the edge* borrows up to Borrow Kit's max.
- *Reset* repays from the wallet to health 1.5; the bot then gives savings back by itself.
- *Pause* and *Limit* are also there.

**New machine.**
- `.env.example` lists every setting.
- `npm run wallet:new` creates a fresh wallet. To run the team's existing loan instead, use the team bot key (ask privately).
- The tunnel needs `tools/cloudflared.exe` (Cloudflare's official release; check its SHA256 against the release notes) or `cloudflared` on PATH.

## Key facts (Arc Testnet, all public)

| | |
|---|---|
| Chain | Arc Testnet, chain id `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io` |
| Borrow Kit market cirBTC→USDC (Morpho id, LLTV 0.86) | `0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58` |
| Morpho Blue | `0x65f435eb4ff05f1481618694bc1ff7ee4680c0a4` |
| Market oracle (fixed 75,000) | `0x917E3d9F366B0561c13155BECdBC8d79E4ED7BA3` |
| cirBTC (8 dec) / USDC ERC-20 view (6 dec) | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` / `0x3600000000000000000000000000000000000000` |
| Savings vault "EarnKit USDC Vault (Arc Testnet)" | `0xaabbef1d3971c710276ed41ec791bbe14cdb8e88` |
| Bot wallet / our loan id | `0xF6B5177872Fc12DCBcE76d023e96988fB7Fa3F0C` / `e4c53980-53a9-5564-a385-73ba1ac933f9` |
| Gemini ladders | `BTC2611302200` (Nov 30, main), `BTC2611202200` (Nov 20). Pattern `BTC<YYMMDD>2200`. |
| Faucet | https://faucet.circle.com (Arc Testnet): 20 USDC per request; 0.0001 cirBTC per wallet every 2 h |

**State on Nov 17 evening:**
- loan: 4.24 USDC debt against 0.0001 cirBTC, health 1.31 at the live price (1.52 on-chain), odds ≈0.15%
- savings: 9.77 USDC, plus 0.23 still inside the loan
- wallet: 14.34 USDC

Check the current values with `npm run loan:show`.

## Lessons learned the hard way

Read these before touching `src/arc.ts`.

1. **Use the `/next` adapter.** `@circle-fin/adapter-viem-v2/next`, not the root import. Borrow Kit needs an atomic batch, which a plain wallet can only send through Arc's sender-preserving batcher. The root import fails with `INPUT_UNSUPPORTED_ACTION` before signing.
2. **The local clock breaks Borrow Kit writes.**
   - Borrow Kit signs each write with a deadline about 2 min out and checks it against `Date.now()`. A fast laptop clock (ours was +157 s) makes every write fail with "execution deadline has expired". `src/clock.ts` corrects it at startup.
   - Syncing the OS clock is the real fix (Windows: Settings → Time & language → Date & time → Sync now).
3. **A failed opening still creates a loan id.** It reads as `PENDING` with null numbers. Finish it with `borrow({ loanId })`; `loan:open` does this.
4. **Borrow Kit's `getPosition` can be stale.** Right after a repay it returned `READY` with the old debt, which could make the bot repay twice. We read the loan from Morpho (`position`, `market`, oracle `price()`) and savings from the vault (`balanceOf` → `convertToAssets`). Earn Kit's position also lagged a few seconds after deposits. The kit reads are only fallbacks.
5. **The testnet oracle price is fixed at $75,000.** Real BTC was about $64k. With the default `PRICE_SOURCE=real`, the bot values collateral at Gemini's live BTC price, so the line and the odds match the real market. The dashboard shows both health numbers.
6. **Borrow Kit lends only up to on-chain health ≈ 1.236** (about 70% LTV). At the live price that is health ≈ 1.06, which is where "push" lands: odds about 42–50%.
   - A borrow can't take the on-chain band below `SAFE`. So the Borrow Kit band-change webhook won't fire from our demo pushes; it called us once right after registration.
7. **Opening a loan takes only the cirBTC Borrow Kit's cap needs** (0.0000757 of 0.0001). The script then `addCollateral`s the rest. Borrow-more may also pull free cirBTC from the wallet.
8. **The vault's `maxWithdraw` returns 0.** That is the Morpho Vault V2 design (`MORPHO()` also reverts). `kit.earn.withdraw` works anyway.
9. **Gemini API quirks.**
   - Contracts are not sorted, and `strike: { type, value }` is the reliable field.
   - The event listing is paged (`offset`). There is no history of odds, which is why we save our own samples every 15 s.
   - Below the lowest bet there is no quote; we fit a log-normal and label those odds "estimated".
10. **Tunnel quirks.**
    - A brand-new `trycloudflare.com` link can take about a minute to resolve.
    - The link changes on every restart: re-run `npm run tunnel` and update the QuickNode destination.
    - Tunnel traffic arrives from localhost, so auth never trusts loopback when proxy headers are present.
11. **Windows quirks.** Node 22's `node --test` needs a quoted glob (`"test/**/*.test.mjs"`). Git's LF→CRLF warnings are harmless.
12. **The QuickNode filter must stay a plain script** (no `import`/`export`). The test loads it the same way QuickNode does.

## Code conventions

- **Language and runtime.** TypeScript ESM run by `tsx` (no build step), Node 22+.
  - TS imports use `.js` extensions (NodeNext).
  - `brain.mjs` stays dependency-free plain JS, so the replay and tests can import it directly.
- **Amounts to Circle's kits** are decimal strings with at most 6 decimals: use `usdc6()`.
  - Kit results are `confirmed` / `confirmed-details-unavailable` / `submitted`; `txOf()` treats `submitted` as an error.
- **Never decide on stale data.** Read the chain first. Keep the one-run-at-a-time rule, the cooldown and the daily cap.
- **Dashboard rules.**
  - Insert server text with `textContent` only, never `innerHTML` with data.
  - Colors come from the CSS tokens in `public/style.css` (light + dark are both defined).
  - Charts keep a table view. Check phone width (no horizontal scroll).
- **New behaviour gets a test** in `test/`, using the saved Gemini fixtures (`test/fixtures/`) rather than live calls.
- **Commits.** Small commits with clear messages, pushed to `main` (the submission). Pull before you push. Run a quick secret check before committing anything new.

## What is left (in order)

- [ ] **QuickNode Stream**
  1. Claim credits via the QuickNode Credits Guide.
  2. Create a Stream: Arc Testnet, *Block with Receipts*, filter = `stream/filter.js`, test on block `72746520` (expect one "our loan: repay" match).
  3. Destination webhook = the URL in `data/stream-webhook-url.txt` on the machine running the tunnel.
  4. Then do a small live move (`npm run roundtrip -- 0.1`) and check that "Woke up: QuickNode Stream" appears in the log.
  5. Add a screenshot to README §6 and flip its row in "What is verified".
- [ ] **Demo video, 2–3 min:** record Thursday evening, script in [docs/DEMO.md](docs/DEMO.md). Also keep a recorded backup of the live save.
- [ ] **Devpost:** fill from [docs/SUBMISSION.md](docs/SUBMISSION.md), opt in to Arc, Gemini and QuickNode, add the video + repo links. Submit before Friday noon CST.
- [ ] **Rehearse the live demo five times** without touching code. Pre-demo checklist in docs/DEMO.md.
- [ ] **Keep the bot wallet funded.** USDC for gas, at least 2 USDC in savings. More cirBTC (every 2 h from the faucet) makes a bigger, steadier loan.
- [ ] **Optional, only if time:**
  - always-on hosting (Railway or similar) instead of the laptop tunnel
  - a Swap Kit fallback when savings run out
  - longer odds history on the chart
- [ ] **Saturday Nov 21:** be at the closing ceremony in person.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `execution deadline has expired` | The local clock is off: sync it. `clock.ts` should already correct it; check the `[clock]` line at startup. |
| `INPUT_UNSUPPORTED_ACTION` on borrow | Wrong adapter import: use `/next`. |
| `LOAN_ALREADY_EXISTS` or loan stuck `PENDING` | Run `npm run loan:open` again; it finishes an expired opening with `borrow({ loanId })`. |
| `BALANCE_INSUFFICIENT_GAS` | Wallet USDC too low: faucet, or lower `GAS_RESERVE_USDC`. |
| Hero says "Odds unavailable" | Gemini is unreachable or the ladders expired. The bot falls back to the health rule; discovery picks new ladders. |
| Demo buttons say "Locked" / 401 | Enter `WEBHOOK_SECRET` from `.env`. |
| Port 3000 already in use | Another server is running, maybe the live bot. Don't start a second live bot. |
| Tunnel link doesn't resolve | Wait about a minute (new DNS name). Check the "Airbag tunnel" terminal is still running. |
