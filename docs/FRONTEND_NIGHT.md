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
- `web/src/charts/xy-chart.tsx`: one chart for every line picture (built on tweenly's chart kit).
- `web/src/components/`: `odds-card` (the big number + odds over time), `line-card` (bitcoin against the line, savings reach), `ladder-card` (Gemini's curve with the line on it, uses the bot's own maths through `@brain` = `src/brain.mjs`), `tiles`, `feed`, `wallet-card` (the four-step path), `proof-card`, `demo-drawer`, `top-bar`, `site-footer`.
- `web/src/data/proof.ts`: the recorded real runs from README "Live proof".
- Server: one read-only addition, `GET /api/ladders` (Gemini's ladder points).

## Done

- Warm-up: worktree, branch pushed (equal to main at d1d42d4), npm ci, simulator, both browsers.
- Research on reference sites (notes below).
- `web/` scaffold: Vite 8, React 19, Tailwind 4, Motion. Classic page moved to `public/classic/`.
- First dense dashboard: thrown away after Matthew's reaction.
- Landing `/`: hero with the live number, the problem (February crash), the fix (replay of the real save), how it knows (Gemini's ladder), the proof (three numbers), the way in.
- App `/app/`: four screens, Loan, Market, On-chain, Try it (`#market`, `#chain`, `#try` in the address).
- Checked: light and dark, 1440 wide and phone width, the red "at risk" state by pushing the simulated loan, the wallet flow against the old page with a fake wallet.
- `test/web-build.test.mjs`: fails if `web/` changed without a rebuild. AGENTS.md and README updated.
- Commit 1.

## Next

1. Screens to look at again with fresh eyes: the landing hero on a wide screen, the replay on a phone, the whose-loan line in the app.
2. Demo path: rewrite `docs/DEMO.md` for the new page (exact clicks, what to say).
3. Fresh-clone deploy proof (`NODE_ENV=production npm ci && npm run sim` in a temp folder).
4. Judge review by a fresh agent, fix, repeat once.
5. Stretch: mainnet cost estimate, hedge quote.
6. Morning report at the top of this file.

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
