# Frontend night: working notes

Branch `frontend-test`, worktree `C:\Users\matth\Desktop\ubc\.claude\worktrees\frontend-test`. The brief is `docs/OVERNIGHT_BRIEF.md`. Read both files first after any break. Delete both before merging.

## Redesign (Nov 18, 2026, evening)

Matthew found the first version too plain, the fonts too basic and the app too complex. What changed since the morning report below:

- **The landing page is a walk-through.** The headline with the live app in a tilted frame, what it does (four cards), who it is for (three cards), then four numbered steps: 1 the problem, 2 a real save replayed, 3 Gemini in depth (with a card that looks like Gemini's own market tab and shows its live bets), 4 Arc in depth. Then the receipts.
- **The app has two screens instead of four:** Live demo and My loan. The Market and On-chain screens are now parts of the landing page. Old links still work: `/app/#market` and `/app/#chain` go to those parts, `/app/#try` opens My loan.
- **Fonts:** Bricolage Grotesque, Geist and Instrument Serif (was Barlow).
- **The five 21st.dev components Matthew picked** (shiny button, metallic button, spotlight card, bounce cards, scroll frame) are written by hand to look and move like them. 21st.dev's registry allowed two downloads a day, and Aceternity's licence does not clearly allow its source in a public repo. See `web/THIRD-PARTY.md`.
- **A push can be seen.** The price picture is bitcoin's price above a shaded floor ("you lose it down here"): on a push the floor rises under the price and the room shrinks. The chance chart ends at this very moment and turns red. The first screen's frame says what it is and has the push button (simulator only).
- **The simulator is out of what judges see** (Turk: nothing simulated in the submission). The README, `docs/SUBMISSION.md` and `docs/DEMO.md` point only at https://airbagged.me, the real page no longer links to the simulator, and the README pictures show the real loan and the replay of a real save. Still to do by hand: the Demo link on Devpost.
- **The alarm rings even when the bot is faster than the page:** the card then shows the odds from the bot's own log line for three seconds.
- Checked: desktop, phone width, dark, the push on the simulator (red for 3 s, then "Saved by Airbag"), 59 tests, no console errors. Not checked: anything that needs a wallet signature.

Wherever the notes below say "four screens", "Loan screen", "Market screen", "On-chain screen" or "Try it", read them as the old layout.

## Morning report (Nov 18, 2026, about 09:15)

1. **Open it.** Nothing is on `main`. Branch `frontend-test`, 6 commits. `git fetch`, `git checkout frontend-test`, `npm install`, `npm run sim`, then http://localhost:3000 (the landing page) and `/app/`. My copy is the worktree `.claude/worktrees/frontend-test`.
2. **What changed.** `/` is a landing page: the headline with the live number, the February crash, a real save replayed from its transactions, Gemini's odds hour by hour, three real saves as receipts. `/app/` has four screens: Loan, Market, On-chain, Try it. The old page is at `/classic/`.
3. **New facts.** Gemini does keep hourly history per bet (our notes said it had none): it is on the Market screen and the landing page. Arc mainnet's gas price equals testnet's, so the mainnet costs would be the same today (read live). A hedge quote from Gemini's own prices, also scaled to a $50,000 loan.
4. **21st.dev pieces.** tweenly: chart kit, segmented control, fade-in. Magic UI: animated beam (light on the wires of the On-chain picture), border beam (red round the card while a loan is at risk), dot pattern (first screen).
5. **Scores** (a cold reviewer as the organiser, the page alone, 6 = a decent hackathon project). First review: Technical 8, Product and UX 7, Innovation 7, Impact 6, Demo 7. Final review, before its fixes: 8, 6, 8, 5, 6. Its top points are fixed since (the alarm, the February cards, Gemini's history up front, QuickNode and Gemini in the picture, the phone replay). Not scored again.
6. **Where we still lose points.** QuickNode shows recorded rows until the Stream points at the live site. Impact: the amounts are testnet cents, and Airbag needs savings worth about 20% of the loan. The number is "estimated" while the loan is calm (Gemini has no bet that low). There is no video yet.
7. **Only the team can fix.** Point the QuickNode Stream at `https://airbagged.me/api/stream`. Put an uptime ping on `/healthz` (both sites sleep after 15 quiet minutes). Verify AirbagGuard's source on Arc's explorer (it shows unverified bytecode). One real push on the live site on Friday morning, and the video. `docs/SUBMISSION.md` still names the simulator as the main link. The simulator's loan is tiny: 0.0001 cirBTC and 10 USDC are hard-coded in `src/arc.ts`, which I did not touch.
8. **Could not test.** Anything that needs a signature: Connect wallet on the live site, the four steps, protection off and on. What I did check: with a fake wallet the new page makes exactly the same requests as the old one, and the new page reads correctly with the live site's real status (read-only). Gemini's Nov 20 ladder expires Friday 22:00 UTC, in the middle of judging: the page follows a changing list, but nobody has watched an expiry.
9. **Waiting on you.** Look at it. If you like it, test with Test 2 on the live site after merging (about 5 minutes, the list is under "You must test with MetaMask"). Then decide whether `frontend-test` goes into `main`. Delete this file and `OVERNIGHT_BRIEF.md` before merging.

Reviews in full: the first is summarised under "Done". The second reviewer hung and was stopped. The final one (16 tool calls, only localhost allowed) said: clean, mostly honest, no longer a wall of text. The live push was the weakest moment. The February cards cheated by omission. QuickNode had only recorded rows. The replay card was taller than a phone screen. Served, out of 10: organiser 7, Arc 7, Gemini 7, QuickNode 4, mentor 6, beginner 6.

## Decisions for Matthew

- **React, as you said.** The React code lives in `web/` with its own `package.json` and lockfile. The built page is committed into `public/`. So the root install that Render runs (`npm ci` on Ahmad's simulator, `npm install` on airbag-live) is unchanged and Render only serves plain files. Changing the page means `npm --prefix web install`, then `npm run web:build`, then commit `public/` too.
- **The real 21st.dev components.** Both charts you linked come from an MIT-licensed library called tweenly. I pulled its real source (chart kit, line chart, KPI card, segmented control and a few more) into `web/src/components/ui/` and `web/src/lib/chart-kit.tsx`.
- **Look: an instrument cluster.** Airbag is car safety gear, so the page looks like a dashboard gauge: dark panels on warm paper, big condensed numbers (Barlow Condensed, a typeface drawn from road signs), one safety-orange accent. The panels stay dark in the light and the dark theme.
- Today's page stays reachable at `/classic` until the new one is tested with MetaMask.
- Two pages: `/` is the landing page, `/app/` is the dashboard.

## You must test with MetaMask

What I could check without a person signing: with a fake wallet in the browser, the new page and the old page (`/classic/`) made exactly the same requests for connect, add savings and borrow more: 11 calls, the same bytes (same SHA-256 of the full request log). So the plan, estimate, send and receipt loop is unchanged.

What only you can check, on the live site with Test 2 (about 5 minutes), on the "My loan" screen (it was called "Try it" before the redesign):
1. Connect wallet. MetaMask should be offered, never Phantom without asking.
2. Step 3 shows "Protection is on" for Test 2 (it already has a guard).
3. Step 4: Push it to the edge, one confirmation. The page should scroll down to *Your loan*, which turns red, then Airbag saves it.
4. Calm it down. Airbag gives the savings back.
5. Turn protection off (two confirmations), then on again (should say "Finish turning it on" and not create a new guard). These two have never been pressed live, on the old page either.

## First reaction from Matthew (before he slept)

He saw my first build of the dashboard and said it looked terrible: AI slop, far too much text, not beginner friendly. He was right: I had carried the old page's text and boxes into a new skin. The rule since then: one idea per screen, one big number, one picture, plain words ("you lose it below $51,828", "bitcoin can fall 20%"), everything else behind a click. Check every screen against "would a beginner get this in 5 seconds".

## Setup facts

- Simulator from this worktree: preview config `frontend-sim` in the MAIN checkout's `.claude/launch.json` (`npm --prefix <worktree> run sim`, port 3000). `.claude/` is git-ignored. Restart it after changing `src/server.ts` (no watch mode).
- Build: `cd web && npm run build` (cleans its own old output in `public/`, typechecks, builds, stamps `public/build.json`). Look at `http://localhost:3000/` and `/app/`.
- Chrome extension works on 21st.dev (Matthew is signed in) and on other sites without prompts. Tab group id from the warm-up: one tab, close it at the end.
- Session is in Auto mode. Keep-awake is on.
- Render: Ahmad's simulator builds with `npm ci` and starts `npm run sim` (render.yaml). Matthew's airbag-live runs `npm install` and `npm start`.
- tweenly registry (public, MIT): `https://trytweenly.vercel.app/r/<name>.json`. Local copies of the JSON in `/tmp/tweenly`.
- Chart colours on the panel surface `#161616`, checked with the dataviz validator: orange `#f0591f`, blue `#3987e5`, aqua `#199e70`. Status colours are fixed: good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`.

## How the new page is put together

- `web/src/wallet/core.js`: the signing logic, moved from the classic page with the same requests in the same order. `use-wallet.ts` is the React side.
- `web/src/charts/xy-chart.tsx`: one chart for every line picture (built on tweenly's chart kit). On a narrow screen its in-plot labels move under the chart.
- `web/src/components/`: `number-card` (the one number), `price-card` (bitcoin against the price where it is lost), `loan-parts` (four facts, the log), `ladder-card` (Gemini's curve with the line on it, the ×2 row), `market-parts` (the odds over time: Gemini's own history, and this loan's), `hedge-card`, `chain-parts` (the money map, the Stream's rows, the costs), `save-replay` (the recorded save), `crash-card` (February), `wizard` (the four steps), `demo-drawer` (a bar at the bottom), `top-bar`, `site-footer`.
- `web/src/recorded/proof.ts`: the recorded real runs (README "Live proof"), the gas each move used, the four Stream deliveries of Nov 17.
- Pure helpers shared with the server and the tests: `src/brain.mjs` (@brain), `src/hedge.mjs` (@hedge), `src/market-history.mjs` (@history).
- Server, read-only additions: `GET /api/ladders` (ladder points, bet prices, the market's link on gemini.com), `GET /api/market-history` (Gemini's hourly candles per bet), `GET /api/gas` (Arc testnet and mainnet gas price).

## Done

- Commit 1 (7fa23f4): the landing page and the four-screen app. Deploy proof passed for it.
- After commit 1: mainnet cost estimate, hedge quote, keys 1 to 4, sim and live link to each other, docs/DEMO.md rewritten.
- **First cold review** (a fresh agent as the six readers, on the build of 07:09). Scores for the five criteria, page alone: Technical 8, Product & UX 7, Innovation 7, Impact 6, Demo 7. How well each reader was served, out of 10: organiser 7, Arc 7, Gemini 6.5, QuickNode 4, mentor 6, beginner 7 on the landing page and 4 in the app. Its main points: sponsors not on the first screen, the main button scrolled to a cut-off replay, two different percentages, no odds over time that the market moves, the number not marked as estimated, QuickNode shown as a paragraph, toy-looking amounts, six identical cards, phone label collisions, "real" said on simulated screens.
- Fixed after that review (commit 2):
  - Landing: Arc and Gemini named above the headline, the four sponsors as a strip under the hero, the three "who it is for" cards gone, section labels gone, the problem written to "you". On the simulator the second button is "Push a loan yourself" (`/app/?demo` opens the controls).
  - Replay: "Watch a real save" lands on the card and all of it fits on screen. It shows the same two prices as the Loan screen instead of a second percentage, one plain sentence per step (with the recorded 41.9%), a labelled stopwatch, UTC on the times, and the wallet's own guard in the details.
  - **Gemini keeps hourly candles per bet** (`GET /v2/candles/GEMI-BTC2611302200-HI65000/1hr`): the team's notes said it had no history. The Market screen now draws the market's own odds over time (the bet nearest bitcoin's price, switch between four), next to this loan's own number with Airbag's moves. Lesson 9 in AGENTS.md is corrected.
  - Market: the title, traded volume and a checked link to the market on gemini.com (`/predictions/<ticker>/<slug>`). The sentence became a row: market's chance, ×2, the number. "estimated" is on the big number and explained under the curve. The loss zone is clean. Table rows add up.
  - Loan: dollars with the token small underneath, savings rate from Earn Kit, room to fall in dollars (so the chance is the only percentage). The badge says "Pushing the loan…" at once, holds "At risk" until the number is down, then "Saved by Airbag" for half a minute.
  - On-chain: one picture of how the money moves (bot's key presses the guard, the guard moves USDC between savings and loan), every box a link. The four Stream deliveries of Nov 17 as rows with their transactions (found on Arc's explorer from the block numbers). Costs as a card.
  - Demo controls: a slim bar at the bottom instead of a box over the tiles. The page scrolls to the number when a button is pressed.
  - Footer: no "old page" link, no "press d" (both still work: `/classic/`, the d key). On the simulator it says what is simulated.
  - February chart: says what the save took ($10,541 of savings, all of it) and that February's odds are modelled.
  - Phones: the app header is 80 px shorter, tiles and the two prices line up, chart labels sit under the chart.
- Checked after these: every screen at 1912 wide in Chrome, at 375 in the built-in browser, the hero in dark, the push in the simulator (pushing, at risk, saved), no console errors, 58 tests, both typechecks.

## Where it stands (Nov 18, about 09:20)

- Six commits on `frontend-test`, all pushed. Never `main`. The sixth only trims the first screen to about 60 words (no small chart there, a shorter sentence).
- The fifth commit holds: the three Magic UI pieces and tweenly's FadeIn, the fixes from the final review (the alarm holds 3 s and the number and badge change together, honest February cards, Gemini's history first and on the landing page, receipts instead of the three-number row, Gemini and QuickNode in the On-chain picture, the replay fits a phone, the demo controls sit in the page), the six README pictures, and `?still` now stops every transition.
- The same content passed the whole proof from a fresh local clone (as ec49697): `npm ci` like Render, 59 tests, every page, file and API answered, then `npm run web:install` and `npm run web:build` left no changed file. After the push the same proof passed again from GitHub for 22fa951 (scratchpad `full-proof.sh <dir> <port>`), and it is run once more for the sixth commit.
- Checked by eye on the last build: all screens at 1912 wide, the phone replay (773 px tall on an 812 px screen), the push (pushing, 40% at risk held, saved in 0.4 s), no console errors, the new page with the live site's real status (read-only).
- Tools left running: the simulator preview `frontend-sim` on port 3000. One Chrome tab on localhost. Close both when done.

## If there is more time

1. A second look at dark theme on every app screen (only the first screen and the Loan screen were looked at in dark after the last changes).
2. The four wizard steps cannot be clicked here. They need Matthew and Test 2.
3. Ideas not done: February three ways (left alone, a plain price rule, Airbag); a live "delivered 12 s ago" row once the Stream points at the live site; full addresses with a copy button.

## For the team (the page cannot fix these)

- Both hosted sites sleep after 15 quiet minutes and take about a minute to wake. Set an uptime ping on `/healthz` before judging.
- Point the QuickNode Stream at `https://airbagged.me/api/stream`, so the On-chain screen shows live events instead of the recorded line.
- docs/SUBMISSION.md still gives the simulator as the demo link and says the live bot needs a laptop. The live bot is hosted at airbagged.me. Which link is the main one is the team's call.

## Research notes

What the best sites do on a first visit:
- **Uniswap, Polymarket:** the product itself is in the first screen (the swap box, a live market with its odds at the end of the line). No description of it.
- **Aave:** four-word headline, one line under it, one button. The pictures are big numbers.
- **Arc, Circle:** one plain statement as the headline, a small label above it, two buttons.
- **Hyperliquid, Morpho:** almost no words, one accent colour.
- **DeFi Saver** (closest competitor): "A better tool for DeFi" over a screenshot full of controls. Generic. Shows risk as a ratio (152.92%), which is what we replace with odds.
- **Kalshi:** a sign-up box over the page on arrival. Do not do this.

What we take: one short headline, the live number as the hero, the product visible at once, one accent colour, no pop-ups.

## Design direction

- First screen of `/`: label "Live on Arc Testnet", headline, one sentence, two buttons, and the live odds instrument. Under 60 words.
- Then: the recorded real save as a replay, the February crash as the "why", who it is for, how it works with the live ladder, the on-chain deeds.
- Dashboard: number and pictures first. Every explanation sits behind "How" or a table toggle.
