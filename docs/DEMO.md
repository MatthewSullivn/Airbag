# Demo playbook

The video is judged for the Gemini and QuickNode bounties (they don't see a live demo), so it matters as much as the code. Finalists also give a 4 min pitch + 2 min Q&A in person on Saturday Nov 21.

The page has two parts. `/` is the landing page, a walk-through: what it does, who it is for, then four numbered steps (1 the problem, 2 the save, 3 Gemini, 4 Arc) and the receipts. Its top bar jumps to any of them. `/app/` is the app, with two screens: **Live demo** and **My loan**.

## Which link

- **https://airbagged.me** is the live bot: a real loan on Arc Testnet. Record the video here.
- **The simulator** (Ahmad's Render link) is for judges without a wallet: *Push a loan yourself* on the first screen, then *Push it to the edge*.

## Pre-demo checklist (30 minutes before)

1. **Open https://airbagged.me once and wait for it to load.** The free server sleeps after 15 quiet minutes and takes about a minute to wake. Keep a tab open on it.
2. **MetaMask on the "Test 2" account, on Arc Testnet.** Lock Phantom. Never sign for this project with a real wallet.
3. **Open the app, go to My loan, press Connect wallet.** It should show step 3 done ("Protection is on") and step 4 ready, with *Your loan* under the steps.
4. **The loan must be calm before you start.** Under *Your loan*: "Safe", and bitcoin can fall 25% or more. If not, press *Calm it down* in step 4 and wait until Airbag has given the savings back.
5. **Savings: at least 3 USDC** (shown beside the steps). Add some in step 2 if needed.
6. **Zoom the browser to 110% or 125%** so the big number reads from the back of the room. In the app, the keys **1** and **2** switch between Live demo and My loan.
7. **Have the recorded save ready** (landing page, step 2, or *Watch a real save*): it is the backup if the network is slow.

## The 2–3 minute video

Record it Thursday evening, not Friday. Talk slowly, with no music over the talking.

| Time | Show (exact clicks) | Say |
|---|---|---|
| 0:00–0:20 | The landing page, top. Scroll a little: the frame lies flat and the big number in it is live. | "Borrow dollars against your bitcoin and you can lose it in one bad day. Airbag shows one number, the chance you lose your bitcoin, and fixes the loan by itself." |
| 0:20–0:40 | Scroll to step **1** (*One bad day can take your bitcoin*). | "February 6, 2026: bitcoin dipped to $60,000. A loan that had borrowed 60% against one bitcoin was sold off and kept a tenth of it. The same loan with Airbag kept the whole bitcoin." |
| 0:40–1:00 | Scroll to step **2** (*Airbag tops up the loan*). The replay plays by itself. | "This is a real save, recorded on Arc. The loan is pushed to the edge. Three seconds later Airbag has moved the owner's savings in. The fee was one cent, paid in USDC." |
| 1:00–1:50 | **One take, no cuts.** Top bar → **My loan** → *Push it to the edge* → confirm in MetaMask. The page scrolls down to *Your loan* by itself: the number goes red and stays red for at least three seconds, then the badge says *Saved by Airbag*. | "Now live, with my own wallet. I push my loan to the edge. Hands off." Wait. "Airbag just moved my savings into my loan, through my own guard contract. It never held my key." Click the transaction link under *What Airbag did*. |
| 1:50–2:15 | *Home*, then **Gemini** in the top bar. Point at the card with Gemini's bets. Hover the curve. Scroll to *Gemini's odds, hour by hour*. | "The number comes from Gemini's prediction market. These are its live bets on bitcoin's price. This is the market's curve for November 30, and the loan's line sits here. Below the lowest bet the curve is estimated, and the page says so. And this is Gemini's own history for one bet, hour by hour." |
| 2:15–2:35 | **Arc** in the top bar. Click the guard's address. | "Everything is on Arc. The savings are in Circle's Earn Kit, the loan in Borrow Kit, and our AirbagGuard contract sits between them. The bot's key can only press save and give back. A save cost one cent, paid in USDC. A QuickNode Stream wakes the bot the moment the loan moves." |
| 2:35–2:50 | Scroll on to the last section (*It already works, on Arc*). | "Three real saves, each with its two transactions. Three or four seconds from danger to safe, about a cent in fees, and the bot never held a wallet key. Next: mainnet." |

After the take, press *Calm it down* on My loan, so the loan is ready for the next run.

## The 4-minute live pitch (finalists)

1. **The problem, 30 s.** Landing page, step 1: the left-alone loan is sold off on Feb 6.
2. **The number, 30 s.** The app, Live demo: "X% chance of losing the bitcoin by Nov 30. Live, from Gemini." Point at "Airbag steps in at 5%".
3. **The save, 75 s.** My loan → *Push it to the edge* → red → hands off → green. Click the transaction.
4. **How the odds work, 40 s.** Landing page, **Gemini**: the market's bets, the curve, the line, doubled for any-time dips, estimated below the lowest bet.
5. **It is real, 30 s.** Landing page, **Arc**: the addresses, the fee, the Stream.
6. **Replay results and what is next, 35 s.**
   - The 60%, 65% and 70% loans were sold off when left alone, and kept their bitcoin with Airbag.
   - At 60%, on average 58% of the savings stayed in the pot.

**If the save is slow,** keep talking about the odds. If nothing has happened after 30 s, show the recorded save on the landing page.

## Questions judges will ask

Use these numbers, not the early drafts. Two answers in our first plan did not survive testing; they are marked ⚠️.

- **"Isn't this just DeFi Saver?"** The saving idea is the same. Two differences: the trigger is a live market's odds instead of a ratio, and it is built for Arc's bitcoin loans on Circle's kits, where nothing like it existed.
- **"Why odds instead of the health factor?"**
  - Nobody knows what health 1.31 means; everyone understands "12% chance by Nov 30".
  - The odds also react to how nervous the market is. With Nov 17's ladders, the odds trigger fires around health 1.19, before Borrow Kit's own WARN band. On a calmer day it would fire later.
- **"Why not just borrow less?"** Then that money is locked in the loan all the time. With Airbag it sits in savings earning interest. ⚠️ In our replay at 60% borrowed, **58%** of the savings stayed in the pot on average (not the 86% in our first draft). In calm stretches all of it did.
- **"Why Arc?"** Fast finality and fees paid in USDC. A save through AirbagGuard is one transaction: it landed 3 s after the push and cost 0.0097 USDC. ⚠️ Don't claim a once-a-day bot gets liquidated: in our replay it survived February too, because the odds were already over the limit the evening before the drop.
- **"Why Gemini? Isn't that a stretch?"** It's a bitcoin loan, and Gemini's ladders price exactly "will BTC be under my line on this date".
- **"What if Gemini's market is thin or wrong?"**
  - It is thin: about $97k traded on the Nov 30 ladder.
  - That is why the bot also acts on health alone (under 1.10), uses the worse of two ladders, and labels estimated odds.
- **"Isn't the testnet price fake?"** Arc Testnet's lending oracle is fixed at $75,000. Airbag values the collateral at Gemini's live BTC price, as a mainnet feed would.
- **"What if savings run out?"**
  - It stops and says so.
  - At 60% borrowed in the replay, the savings were fully used at the worst point and the loan still survived.
  - Next step: sell a slice of collateral with Swap Kit.
- **"Who holds the keys?"** On the hosted bot, nobody but the owner. `AirbagGuard` is a contract where the bot's own key can only move the owner's savings into the owner's own loan and back, with a daily cap and a health floor on-chain, and the owner can pause it or cut it off. Our hosted bot at airbagged.me runs this way and holds no wallet key. Any visitor's wallet gets its own guard from the My loan screen. We tested that live with a third wallet (README "Live proof"). The first bot wallet we built with still signs with its own testnet-only key on a laptop.
- **"What if the bot is offline?"** Then nothing is protected. The webhook and the Stream wake it faster, but production needs always-on hosting.
- **"Does it make money?"** No. It keeps your bitcoin. If bitcoin keeps falling after a save, being liquidated would have left more cash.
- **"Why does the page say 'you lose it below' instead of 'liquidation price'?"** Same number, plain words. Health and the other DeFi terms are in the table views and the README.
