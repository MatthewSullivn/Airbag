# The always-on demo link

Judges review submissions Friday and Saturday, while our laptops are off or on a plane. The tunnel link (`npm run tunnel`) dies with the laptop. So the public demo runs the **simulator** on Render's free plan, around the clock.

What it is:
- `npm run sim`: a simulated Arc loan and savings pot, with **live Gemini odds**. No wallet, no keys, no real transactions.
- `PUBLIC_DEMO=true`: visitors see a **Try the demo** button and can press *Push it to the edge*, *Reset* and set the limit without a key. The panel opens by itself on a first visit.
- *Pause* stays key-only, so one visitor can't freeze the bot for everyone.
- All visitors share one rate limit of 30 demo requests a minute.
- `PUBLIC_DEMO` is ignored in live mode (`src/public-demo.mjs`, tested in `test/public-demo.test.mjs`). The live bot always needs `WEBHOOK_SECRET`.

The live proof (real transactions on Arc Testnet) stays in the README and the video. The hosted page is for trying it.

## Set it up (about 5 minutes, once)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick the `MatthewSullivn/ubc` repo. Render reads `render.yaml` and creates the `airbag-demo` web service.
   - If Render can't see the repo, the repo owner has to sign in, or grant Render access to it on GitHub.
3. Click **Apply**. The first build takes a few minutes. The link looks like `https://airbag-demo-xxxx.onrender.com`.
4. Open the link. Check:
   - the badge says "Simulated Arc · live Gemini odds"
   - the big number shows odds (not "Odds unavailable")
   - **Try the demo → Push it to the edge**: within about 10 seconds the log says *"Odds hit …% … Moved … USDC from savings into the loan"* and the number goes green
5. Put the link in `docs/SUBMISSION.md` (Demo) and on Devpost.

Every push to `main` redeploys it.

## Things to know

- **The free plan sleeps** after 15 minutes with no visitors. The next visit takes about a minute to wake it up. Open the link yourself a few minutes before you share it. To keep it awake, point a free uptime checker (for example UptimeRobot) at `https://<your-link>/healthz` every 5 minutes.
- **The simulator restarts fresh** on every deploy or wake-up: a calm loan at health 1.40 and 10 USDC of savings.
- **If the odds say "unavailable"** on the hosted page, Gemini isn't answering Render. The bot still saves the loan on the health rule (under 1.10), so the demo still works. Tell the team before the video.
- **Gemini ladders expire.** `BTC2611202200` settles on Nov 20. The bot finds new BTC ladders by itself, so nothing needs changing.
