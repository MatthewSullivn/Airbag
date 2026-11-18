# Devpost submission (draft)

Submit at `ubc-hackathon-2026.devpost.com` before **Friday Nov 20, 12:00 PM CST**. Submit early, then edit. Every number below comes from our own runs (README "Live proof" and §7). Keep it that way when you edit.

## Basics

| Field | Value |
|---|---|
| Project name | Airbag |
| Short description | Live prediction-market odds that your bitcoin loan gets liquidated, and a bot that fixes the loan before it happens. |
| Team members | *(add everyone)* |
| Main track | DeFi and Onchain Applications |
| Chain award | Best use of Arc |
| Bounties (opt in to each) | Gemini Prediction Markets; QuickNode Streams |
| GitHub | https://github.com/MatthewSullivn/ubc |
| Demo | https://airbag-demo.onrender.com (always on, simulated loan with live Gemini odds, judges can press "Push it to the edge" themselves. It sleeps when nobody visits, so the first load can take about a minute. The live bot's tunnel link only works while the laptop runs.) |
| Video (2–3 min) | *(YouTube or Google Drive link; open it in a private window to check judges can view it)* |

## What did you build?

Airbag is an autopilot for bitcoin-backed loans on Arc. It watches a USDC loan made against cirBTC with Circle's Borrow Kit. It turns Gemini's live bitcoin price prediction markets into one number: the chance you lose your bitcoin.

When that number passes your limit, Airbag moves USDC from a savings vault (Circle's Earn Kit, earning interest) into the loan, which pushes the liquidation line out of reach. When the market calms down, it moves the money back. There is no approve button.

## What problem does it solve?

Getting liquidated is the biggest fear of anyone who borrows against crypto, and it can happen in one bad day. On Feb 5–6, 2026, bitcoin fell from about $73,000 to $60,000. In our replay, a loan that had borrowed 60% against 1 BTC was liquidated and kept 0.10 BTC.

Loan apps show a "health factor" nobody understands. Staying safe today means borrowing less (cash locked up doing nothing) or watching charts all night. Airbag shows a number people already understand, "12% chance you lose your bitcoin by Nov 30", and acts on it by itself.

## How does it work?

- **Odds.** Airbag reads Gemini's "BTC price on <date>" ladders.
  - The middle of bid and ask gives the chance BTC ends above each strike.
  - Interpolating gives the chance it ends below the loan's line.
  - That is doubled, because the loan dies if the price touches the line at any moment, not only on the end date (the reflection principle).
  - Below Gemini's lowest bet, a log-normal fitted to the ladder estimates the tail, and the dashboard labels it "estimated".
  - The bot uses the worse of the Nov 30 and Nov 20 ladders.
- **The rule.**
  - Act when the odds pass the limit (default 5%) or health falls under 1.10.
  - Repay to the safer of health 1.25 or the highest line whose odds are under the limit.
  - Give savings back only when the odds are under half the limit and health is above 1.40, and never below 1.30.
- **Actions.** Circle's App Kit on Arc Testnet: `earn.withdraw` → `borrow.repay` to save the loan; `borrow.borrow` → `earn.deposit` to give it back.
  - The bot reads the loan straight from the Morpho contract and the vault on-chain, because the kits' read APIs lag after a write.
- **Alarms.** A 5-second timer, Borrow Kit's health-band webhook, and a QuickNode Stream filtered to our Morpho market and wallet.
- **Dashboard.** The odds, the liquidation line, health, the savings pot, a plain-English log with explorer links, odds over time, and a crash replay.
- **Live on Arc Testnet.**
  - We pushed a real loan to 42% odds.
  - The bot moved 0.78 USDC from savings into the loan, and it was safe again 4 seconds later on-chain, for 0.0154 USDC of gas.
  - After a reset, it gave 0.55 USDC back to savings by itself.
  - Any wallet can connect on the page, open its own loan and turn on protection. The bot then protects that loan through the wallet's own `AirbagGuard` contract and never holds its key. A third wallet tried it: the bot saved its loan 3 seconds after the push (README "Live proof").

## What makes it unique?

- **The trigger is a real-money market's odds, not a ratio.** The odds react to how nervous the market is. With Nov 17's ladders the odds trigger fires around health 1.19, before Borrow Kit's own WARN band. On a calmer day it would fire later.
- **The first protection we know of for Arc's new bitcoin loans.** It is built on Circle's Borrow Kit and Earn Kit and composes with Morpho rather than rebuilding a lending protocol.
- **The protection money keeps earning.** It sits in a yield vault and only enters the loan when the odds say so.
- **Honest scope.** Auto-protection tools exist on Ethereum (DeFi Saver). What is new is the combination: a live prediction market as the trigger, on Arc's bitcoin loans.

## What would you build next?

- **Non-custodial.** We wrote `AirbagGuard` (`contracts/`): the bot's own key can only move the owner's savings into the owner's own loan and back, with a daily cap and a health floor on-chain. It runs on Arc Testnet and the bot can sign through it (README "Live proof"). One guard per user works from the page too (Connect wallet). Next is moving our first bot wallet to it.
- **Mainnet**, with a real price feed (Arc Testnet's lending oracle is fixed at $75,000).
- **When savings run out:** sell a small slice of collateral with Swap Kit.
- **Alerts** on Telegram/X or by voice, and many loans per user.
- **Always-on hosting.**

## Technologies and sponsor tools

- Arc Testnet
- Circle App Kit: Borrow Kit and Earn Kit, with `@circle-fin/adapter-viem-v2/next`
- Morpho Blue (underneath Borrow Kit), via viem reads
- Gemini Prediction Markets API (event ladders, active-event discovery), plus Gemini market data (BTC price, daily candles)
- QuickNode Streams (Arc Testnet, Block with Receipts, JS filter, webhook)
- Node.js, TypeScript, Express, plain HTML/SVG
- Cloudflare quick tunnel
- AI: Claude Code as a pair programmer

## "What to Submit" checklist

- [ ] Name, short description, all team members
- [ ] Main track, chain award, bounties, and opted in to each prize
- [ ] The five written answers above
- [ ] Technologies / sponsor tools
- [ ] Public GitHub repo with setup instructions (README §10) ✅
- [ ] Working demo (live link on the day + the video)
- [ ] 2–3 min demo video on YouTube/Drive, viewable by judges
- [ ] Technical docs / architecture in README ✅
- [ ] Track-specific items:
  - contract addresses ✅ (README §3)
  - economic design and risk assumptions ✅ (README §4–5)
  - QuickNode Stream configuration ✅ (README §6). **The Stream itself still needs to be created and verified.**
- [ ] Everyone who can attends the closing ceremony in person (Sat Nov 21). That is required to receive prizes.
