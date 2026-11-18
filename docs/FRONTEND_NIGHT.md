# Frontend night: working notes

Branch `frontend-test`, worktree `C:\Users\matth\Desktop\ubc\.claude\worktrees\frontend-test`. The brief is `docs/OVERNIGHT_BRIEF.md`. Read both files first after any break. Delete both before merging.

## Morning report

(written at the end)

## Decisions for Matthew

- **React, as you said.** The React code lives in `web/` with its own `package.json` and lockfile. The built page is committed into `public/`. So the root install that Render runs (`npm ci` on Ahmad's simulator, `npm install` on airbag-live) is unchanged and Render only serves plain files. Changing the page means `npm --prefix web install`, then `npm run web:build`, then commit `public/` too.
- **The real 21st.dev components.** Both charts you linked come from an MIT-licensed library called tweenly. I pulled its real source (chart kit, line chart, KPI card, segmented control and a few more) into `web/src/components/ui/` and `web/src/lib/chart-kit.tsx`.
- **Look: an instrument cluster.** Airbag is car safety gear, so the page looks like a dashboard gauge: dark panels on warm paper, big condensed numbers (Barlow Condensed, a typeface drawn from road signs), one safety-orange accent. The panels stay dark in the light and the dark theme.
- Today's page stays reachable at `/classic` until the new one is tested with MetaMask.
- Two pages: `/` is the landing page, `/app/` is the dashboard.

## You must test with MetaMask

What I could check without a person signing: with a fake wallet in the browser, the new page and the old page (`/classic/`) made exactly the same requests for connect, add savings and borrow more: 11 calls, the same bytes (same SHA-256 of the full request log). So the plan, estimate, send and receipt loop is unchanged.

What only you can check, on the live site with Test 2 (about 5 minutes), on the "Try it" screen:
1. Connect wallet. MetaMask should be offered, never Phantom without asking.
2. Step 3 shows "Protection is on" for Test 2 (it already has a guard).
3. Step 4: Push it to the edge, one confirmation. The Loan screen should turn red, then Airbag saves it.
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
- `web/src/data/proof.ts`: the recorded real runs (README "Live proof"), the gas each move used, the four Stream deliveries of Nov 17.
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

## Next

1. Deploy proof for commit 2 (fresh clone, `npm ci`, `npm run sim` on another port).
2. New screenshots for the README (the ones there show the old page) and for Matthew.
3. Second cold review, fix what it finds, last commit.
4. Morning report at the top of this file.

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
