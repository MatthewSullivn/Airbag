# Demo playbook

The video is judged for the Gemini and QuickNode bounties (they don't see a live demo), so it matters as much as the code. Finalists also give a 4 min pitch + 2 min Q&A in person on Saturday Nov 21.

The page has two parts. `/` is the landing page. Its first screen plays February 2026's crash on a candle chart, with Airbag (about 13 s, in three steps written under the chart; press a step to go to it). The switch above the chart plays the same week without Airbag. Then the live loan, a real save replayed, **Gemini** (four tabs for more), **Arc** and the receipts. Its top bar jumps to any of them. `/app/` is the app, with two screens: **Live demo** and **My loan**.

On the live site nobody can push the Live demo's loan from the page: it is real, and the server does not hold its owner's key. The bar at its top says so and offers three ways to see Airbag act: *Push it on paper* (a what-if with two sliders, lower on the same screen), *Watch a real save*, and *Push your own loan*. To push that loan for real, its owner runs `npm run demo:push` on their own machine, and `npm run demo:reset` afterwards.

Both app screens show a loan the same way: the chance and the price as two charts, **On Arc, right now** (the money, with Arc's block number counting live), and **How this number is made, right now** (Gemini's live prices turning into the number). On My loan, once the wallet is set up, all of it fits one screen under a slim bar with the two buttons.

## Which link

- **https://airbagged.me** is the live bot: a real loan on Arc Testnet. Record the video here.
- **It is the only link we give judges.** Our mentor's advice: nothing simulated in the submission. The simulator (`npm run sim`, and Ahmad's hosted copy) is a tool for working on the page. Don't show it or link it.

## Pre-demo checklist (30 minutes before)

1. **Open https://airbagged.me once and wait for it to load.** The free server sleeps after 15 quiet minutes and takes about a minute to wake. Keep a tab open on it.
2. **MetaMask on the "Test 2" account, on Arc Testnet.** Lock Phantom. Never sign for this project with a real wallet.
3. **Open the app, go to My loan, press Connect wallet.** It should show a slim bar, "Your loan · Airbag is protecting it", with *Push it to the edge* and *Calm it down*, and the whole loan under it. If it shows the four steps instead, protection is not on yet: wait a minute after a restart, or finish step 3.
4. **Press both buttons once before recording.** They moved into that bar on Nov 19 and have not been pressed with a wallet since. They make the same calls as before. If one fails, *The steps* opens the old steps, which still work.
5. **The loan must be calm before you start.** "Safe", and bitcoin can fall 25% or more. If not, press *Calm it down* and wait until Airbag has given the savings back.
6. **Savings: at least 3 USDC** ("Savings, ready" in *On Arc, right now*). Add some under *The steps* if needed.
7. **The two green dots must be on:** "Gemini's live feed" and "block …" in *On Arc, right now*. They show the page is hearing Gemini and Arc live.
8. **For the hedge to show in the take:** the hosted bot needs the two test-key lines (`GEMINI_SANDBOX_KEY`, `GEMINI_SANDBOX_SECRET`) in Render's Environment tab. Then each save is followed by a line "Hedge on Gemini's test site: bought …" under *What Airbag did*. Without them the save works the same and there is no such line.
9. **Record at 1920 × 1080 with the browser full screen.** Then the whole My loan screen fits without scrolling. In the app, the keys **1** and **2** switch between Live demo and My loan.
10. **Have the recorded save ready** (landing page, *A real save, recorded on Arc*, or *Watch a real save* in the app): it is the backup if the network is slow.

## The 2–3 minute video

Record it Thursday evening, not Friday. Talk slowly, with no music over the talking.

| Time | Show (exact clicks) | Say |
|---|---|---|
| 0:00–0:20 | The landing page, top. Press **Without Airbag** on the chart and let it play (about 13 s): the candles fall, one touches the line, *Sold*, 0.10 BTC. | "Borrow dollars against your bitcoin, and one bad day can sell it. This is February 2026 on bitcoin's real prices. The line is where the loan sells your bitcoin. On February 6 one candle touched it: nine tenths of the bitcoin sold at the bottom." |
| 0:20–0:40 | Press **With Airbag** and let it play: the airbag opens on Feb 4, the candle of Feb 6 lands on it (1 BTC). | "The same week with Airbag. On February 4 the odds of a crash pass 5%, so Airbag pays the loan down with the owner's own savings, and the line moves down. Two days later the same candle lands above it. The whole bitcoin is kept." (February's odds are worked out from bitcoin's own swings: Gemini's ladders start later. The line under the story says so.) |
| 0:40–1:00 | Scroll on past the live loan to *A real save, recorded on Arc*. The replay plays by itself. | "This is a real save, recorded on Arc. The loan is pushed to the edge. Three seconds later Airbag has paid part of it back with the owner's savings, so the price that would take the bitcoin is far away again. The fee was one cent, paid in USDC." |
| 1:00–1:20 | Top bar → **My loan**. Before pressing anything, point at *How this number is made, right now*. Wait for a price to flash. | "This is my own loan. The number comes from Gemini's prediction market, live. These are two of its bets on bitcoin's price, ticking as people trade. From them: the chance bitcoin ends below my price. Doubled, because a dip at any moment counts. Under 5%, so Airbag waits." |
| 1:20–1:55 | **One take, no cuts.** *Push it to the edge* → confirm in MetaMask. Everything is on one screen: the number goes red and stays red for at least three seconds, the strip says *Over 5%. Airbag steps in.*, then the badge says *Saved by Airbag* and "Savings in the loan" goes up in *On Arc, right now*. | "I push my loan to the edge. Hands off." Wait. "The odds jumped over my limit. Airbag moved my savings into my loan, through my own guard contract. It never held my key." Point at the new line under *What Airbag did*: "And it bought the hedge on Gemini's test site, through Gemini's order API." Click a "see it" link in the line "Seen on Arc by QuickNode's Stream". |
| 1:55–2:20 | *Home*, then **Gemini** in the top bar. Point at the card with Gemini's bets (its prices flash when they change). Under it, hover the curve, then press the tabs one by one: *Hour by hour*, *Are the odds any good?*, *Insurance* (the hedge ticket). | "This is Gemini's market itself, live. The curve for November 30, with my loan's line on it. Gemini's own history for one bet, hour by hour. We checked 47 of Gemini's markets that already ended: what it called 80% happened 87% of the time. And the same market sells insurance: this is the order that covers the loan. On Gemini's test site Airbag places it for real. On the real site it is a quote." |
| 2:20–2:40 | **Arc** in the top bar. Click the guard's address. | "Everything is on Arc. The savings are in Circle's Earn Kit, the loan in Borrow Kit, and our AirbagGuard contract sits between them. The bot's key can only press save and give back. A save cost one cent, paid in USDC. Two live feeds wake the bot: Gemini's for the market, and a QuickNode Stream for the chain." |
| 2:40–2:55 | Scroll on to the last section (*It already works, on Arc*). | "Real saves, each with its two transactions. Three to six seconds from danger to safe, about a cent in fees, and the bot never held a wallet key. Next: mainnet." |

After the take, press *Calm it down* on My loan, so the loan is ready for the next run.

## The 4-minute live pitch (finalists)

1. **The problem, 30 s.** Landing page, top: press *Without Airbag* on the chart: a candle touches the line on Feb 6, sold, 0.10 BTC left. Then *With Airbag*: the airbag opens on Feb 4, two days early, and all 1 BTC is kept. (Press a step under the chart to hold on it. Every day is in the table under the chart, if asked.)
2. **The number, 30 s.** The app, Live demo: "X% chance of losing the bitcoin by Nov 30. Live, from Gemini." Point at *How this number is made, right now*: two live bets, the chance below the line, doubled, against 5%.
3. **The save, 75 s.** My loan → *Push it to the edge* → red → hands off → green, all on one screen. Click a "see it" link.
4. **How the odds work, 40 s.** Landing page, **Gemini**: the market's bets, the curve, the line, estimated below the lowest bet, and the hedge ticket (the *Insurance* tab).
5. **It is real, 30 s.** Landing page, **Arc**: the addresses, the fee, the Stream.
6. **Replay results and what is next, 35 s.**
   - The 60%, 65% and 70% loans were sold off when left alone, and kept their bitcoin with Airbag.
   - At 60%, on average 58% of the savings stayed in the pot.

**If the save is slow,** keep talking about the odds. If nothing has happened after 30 s, show the recorded save on the landing page.

## Questions judges will ask

Use these numbers, not the early drafts. Two answers in our first plan did not survive testing; they are marked ⚠️.

- **"Doesn't this defeat the purpose of the liquidation line?"** No. The line protects the lender. Airbag never touches it: it pays back part of the loan early, with the borrower's own savings, which is what the lender wants anyway. If the savings run out and bitcoin keeps falling, the loan is still sold off. The line protects the lender; Airbag protects the borrower.
- **"Do you place the hedge on Gemini?"** On Gemini's test site, yes: after a save the bot buys the "No" contracts through Gemini's order API, with test money, and Gemini filled our test orders. On the real site it stays a quote with a link, because those markets are real money and this is a testnet project.
- **"How do you know the odds mean anything?"** We checked 47 of Gemini's bitcoin markets that had ended, 256 bets with a real trade before the end. Likelier bets came true more often at every step: what the market called 80% happened 87% of the time. It is two days of thin hourly markets, so a first look.
- **"Why double the chance?"** A loan dies if bitcoin touches the line at any moment, not only at the end. In theory touching is twice as likely as ending below. In those settled markets it was 1.5 times. So doubling errs on the careful side: Airbag steps in a little early, not late.
- **"Can I change the 5%?"** It is the owner's setting. On the Live demo anyone can try another limit on paper: the what-if runs the bot's own rule and says what it would do. On our hosted bot one limit applies to every loan it protects; a limit per wallet is next.
- **"Is the number really live?"** Yes. The page listens to Gemini's live feed and works the number out itself with the bot's own code. The bot is woken by the same feed and reads the prices again before it decides. Its own last check is printed next to the page's number.
- **"Isn't this just cross margin?"** Same idea, different default. Cross margin keeps all your spare money inside the position all the time. Airbag keeps it outside, earning interest (4.2% in the vault), and brings in only what is needed, only when the odds say so. In our replay at 60% borrowed, 58% of the savings stayed outside on average. And Arc's bitcoin loans are isolated Morpho markets: there is no cross margin to switch on. What cross margin does better: it needs no bot, so it cannot be offline.
- **"Is it insurance?"** No. Insurance pays you back after the loss; Airbag stops the loss (the page's top line: "Keep your bitcoin through a crash."). There is no insurer and no premium. The money that saves the loan is the borrower's own savings, earning interest until it is needed, and it goes back to savings when the market calms down. The part that pays out like a policy is the hedge: "No" contracts on Gemini that pay if bitcoin ends low.
- **"Isn't this just DeFi Saver?"** The saving idea is the same. Two differences: the trigger is a live market's odds instead of a ratio, and it is built for Arc's bitcoin loans on Circle's kits, where nothing like it existed.
- **"Why odds instead of the health factor?"**
  - Nobody knows what health 1.31 means; everyone understands "12% chance by Nov 30".
  - The odds also react to how nervous the market is. With Nov 17's ladders, the odds trigger fires around health 1.19, before Borrow Kit's own WARN band. On a calmer day it would fire later.
- **"Why not just borrow less?"** Then that money is locked in the loan all the time. With Airbag it sits in savings earning interest. ⚠️ In our replay at 60% borrowed, **58%** of the savings stayed in the pot on average (not the 86% in our first draft). In calm stretches all of it did.
- **"Why Arc?"** Fast finality and fees paid in USDC. A save through AirbagGuard is one transaction: it landed 3 s after the push and cost 0.0097 USDC. ⚠️ Don't claim a once-a-day bot gets liquidated: in our replay it survived February too, because the odds were already over the limit the evening before the drop.
- **"What is in it for Gemini?"** New customers. Every borrower is a natural buyer of "No": they want to be paid if bitcoin ends low, and Airbag writes that order for them, sized to their loan. And two things borrowers would ask Gemini for: lower strikes, and a "touch" bet (did bitcoin ever trade below X), which would be the exact hedge for a loan.
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
