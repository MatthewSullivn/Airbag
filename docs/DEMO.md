# Demo playbook

The video is judged for the Gemini and QuickNode bounties (they don't see a live demo), so it matters as much as the code. Finalists also give a 5 min pitch + 2 min Q&A in person on Saturday Nov 21.

## Pre-demo checklist (30 minutes before)

1. **Sync the computer's clock** (Windows: Settings → Time & language → Date & time → Sync now). A clock a few minutes off breaks Borrow Kit writes; the app corrects for it, but don't rely on that on stage.
2. **Run `npm run loan:show`** and check:
   - the loan is calm: odds under 2.5%, health about 1.3 or more at the live price
   - savings hold at least 2 USDC
   - the wallet holds at least 2 USDC (for gas and the Reset button)
   - if not, use Reset and let the bot give savings back, or `npm run savings:deposit -- 2`
3. **Start exactly one live bot:** `npm start`. Run `npm run tunnel` only if judges need the public link or the QuickNode Stream should deliver.
4. **Open the dashboard,** press **d**, unlock with `WEBHOOK_SECRET`, then close the panel. The key is remembered for that browser tab. Zoom the browser to about 125% so the big number reads from the back of the room.
5. **Open an explorer tab** on the loan's first borrow transaction (README "Live proof").
6. **Have the backup recording of a live save ready to play**, in case the network or Circle's service is slow.

## The 2–3 minute video

Record it Thursday evening, not Friday. Talk slowly, with no music over the talking, and zoom in on the number.

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | The crash replay chart | "On Feb 6, 2026 bitcoin dipped to $60,000. A loan that had borrowed 60% against one bitcoin was liquidated and kept a tenth of it. One bad day." |
| 0:20–0:45 | The dashboard, green | "Airbag shows the real odds you lose your bitcoin, from Gemini's prediction market, and fixes the loan by itself. Spare USDC waits in a savings vault on Arc, earning interest. When the odds pass your limit, the bot moves it into the loan. When things calm down, it moves it back." |
| 0:45–1:45 | **One take, no cuts.** Press d → *Push it to the edge* | The number jumps to about 42%, red. "Hands off." In a few seconds the log says *"Odds hit 42%… Moved 0.78 USDC from savings into the loan"* and the number goes green. Open the withdraw and repay transactions on the explorer. |
| 1:45–2:15 | README / dashboard sections | **Arc + Circle Borrow Kit and Earn Kit:** gas is paid in USDC; a whole save cost about 1.5 cents and landed 4 seconds after the push. **Gemini:** the ladder becomes the odds (doubled for any-time dips, "estimated" below the lowest bet, the worse of two dates). **QuickNode:** a Stream filtered to our lending market and wallet wakes the bot, as does Borrow Kit's webhook. |
| 2:15–2:40 | README "What existed before" | "Auto-protection exists on Ethereum, triggered by ratios. Airbag is triggered by a live market's odds and is the first for Arc's bitcoin loans. Next: Circle Wallets instead of a server key, a mainnet price feed, and a Swap Kit fallback." |

## The 5-minute live pitch (finalists)

1. **Problem, 30 s.** The replay chart: the left-alone line gets crossed on Feb 6.
2. **The number, 30 s.** "X% chance you lose your bitcoin by Nov 30. Source: Gemini, live." Point at the limit.
3. **Proof it is real, 15 s.** The loan's transaction on the explorer.
4. **The save, 60 s.** Push → red → hands off → green. Click the two transactions.
5. **How the odds work, 45 s.** Ladder → chance below the line → doubled → estimated tail. The note under the big number says which kind it is.
6. **Replay results, 45 s.**
   - The 60%, 65% and 70% loans were liquidated when left alone, and kept their bitcoin with Airbag.
   - At 60%, on average 58% of the savings stayed in the pot.
7. **New and next, 30 s.** One line each.

**If the save is slow,** keep talking about the odds. If nothing has happened after 30 s, play the backup recording.

## Questions judges will ask

Use these numbers, not the early drafts. Two answers in our first plan did not survive testing; they are marked ⚠️.

- **"Isn't this just DeFi Saver?"** The saving idea is the same. Two differences: the trigger is a live market's odds instead of a ratio, and it is built for Arc's bitcoin loans on Circle's kits, where nothing like it existed.
- **"Why odds instead of the health factor?"**
  - Nobody knows what health 1.31 means; everyone understands "12% chance by Nov 30".
  - The odds also react to how nervous the market is. With Nov 17's ladders, the odds trigger fires around health 1.19, before Borrow Kit's own WARN band. On a calmer day it would fire later.
- **"Why not just borrow less?"** Then that money is locked in the loan all the time. With Airbag it sits in savings earning interest. ⚠️ In our replay at 60% borrowed, **58%** of the savings stayed in the pot on average (not the 86% in our first draft). In calm stretches all of it did.
- **"Why Arc?"** Fast finality and fees paid in USDC. A save is two transactions: they landed 4 s after the push and cost 0.0154 USDC. ⚠️ Don't claim a once-a-day bot gets liquidated: in our replay it survived February too, because the odds were already over the limit the evening before the drop.
- **"Why Gemini? Isn't that a stretch?"** It's a bitcoin loan, and Gemini's ladders price exactly "will BTC be under my line on this date".
- **"What if Gemini's market is thin or wrong?"**
  - It is thin: about $97k traded on the Nov 30 ladder.
  - That is why the bot also acts on health alone (under 1.10), uses the worse of two ladders, and labels estimated odds.
- **"Isn't the testnet price fake?"** Arc Testnet's lending oracle is fixed at $75,000. Airbag values the collateral at Gemini's live BTC price, as a mainnet feed would, and shows both numbers.
- **"What if savings run out?"**
  - It stops and says so.
  - At 60% borrowed in the replay, the savings were fully used at the worst point and the loan still survived.
  - Next step: sell a slice of collateral with Swap Kit.
- **"Who holds the keys?"** In the demo, our server holds a testnet-only key. We also wrote `AirbagGuard`: a contract where the bot's own key can only move the owner's savings into the owner's own loan and back, with a daily cap and a health floor on-chain, and the owner can pause it or cut it off. It runs on Arc Testnet, and with `USE_GUARD=true` the bot signs through it, so the server no longer needs the wallet's key (README "Live proof"). Our hosted bot at airbag-live.onrender.com runs this way.
- **"What if the bot is offline?"** Then nothing is protected. The webhook and the Stream wake it faster, but production needs always-on hosting.
- **"Does it make money?"** No. It keeps your bitcoin. If bitcoin keeps falling after a save, being liquidated would have left more cash.
