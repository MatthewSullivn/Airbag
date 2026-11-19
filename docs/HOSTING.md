# The hosted simulator

**Not the link for judges.** The submission points at the real loan on https://airbagged.me (our mentor's advice: nothing simulated). The simulator is a tool for working on the page and for trying it without a wallet. This file says how its hosted copy on Render's free plan is set up.

What it is:
- `npm run sim`: a simulated Arc loan and savings pot, with **live Gemini odds**. No wallet, no keys, no real transactions.
- `PUBLIC_DEMO=true`: visitors can press *Push it to the edge*, *Reset* and set the limit without a key. The buttons are at the top of the app's *Live demo* screen, and *Push it to the edge* is also on the first screen.
- *Pause* stays key-only, so one visitor can't freeze the bot for everyone.
- All visitors share one rate limit of 30 demo requests a minute.
- `PUBLIC_DEMO` is ignored in live mode (`src/public-demo.mjs`, tested in `test/public-demo.test.mjs`). The live bot always needs `WEBHOOK_SECRET`.

The live proof (real transactions on Arc Testnet) is in the README, on the real site and in the video.

## Set it up (about 5 minutes, once)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick the `MatthewSullivn/airbag` repo. Render reads `render.yaml` and creates the `airbag-demo` web service.
   - If Render can't see the repo, the repo owner has to sign in, or grant Render access to it on GitHub.
3. Click **Apply**. The first build takes a few minutes. The link looks like `https://airbag-demo-xxxx.onrender.com`.
4. Open the link. Check:
   - the badge says "Simulated Arc · live Gemini odds"
   - the big number shows odds (not "Odds unavailable")
   - **Push it to the edge**: within about 10 seconds the number turns red, then the log says *"Odds hit …% … Moved … USDC from savings into the loan"* and the number goes green

Every push to `main` redeploys it.

## Things to know

- **The free plan sleeps** after 15 minutes with no visitors. The next visit takes about a minute to wake it up. Open the link yourself a few minutes before you share it. To keep it awake, point a free uptime checker (for example UptimeRobot) at `https://<your-link>/healthz` every 5 minutes.
- **The simulator restarts fresh** on every deploy or wake-up: a calm loan at health 1.40 and 10 USDC of savings.
- **Its savings last about a dozen pushes.** Every save leaves about 0.77 USDC in the loan, and Reset brings back less than that. After that the page says the savings are used up, until the next restart.
- **If the odds say "unavailable"** on the hosted page, Gemini isn't answering Render. The bot still saves the loan on the health rule (under 1.10), so the demo still works. Tell the team before the video.
- **Gemini ladders expire.** `BTC2611202200` settles on Nov 20. The bot finds new BTC ladders by itself, so nothing needs changing.
