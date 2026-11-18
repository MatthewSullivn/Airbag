# Overnight brief (Nov 18, 2026)

Matthew's brief for the overnight frontend run, kept here word for word so the work can always be checked against it. Delete this file and `FRONTEND_NIGHT.md` before merging.

Added by Matthew after the brief, before he went to sleep: "you can use react im telling you go ahead, your rebuilds may look ugly". So: use React and the real 21st.dev components, not hand-made copies.

---

Overnight job: rebuild Airbag's frontend while I sleep. Keep working until I write that I'm awake.

THE POINT
We want to win. On Friday the judges open our link cold, and the page has to do the pitching for us. Today they get a wall of text.

WHO OPENS IT
This comes from the hackathon guide: C:\Users\matth\Downloads\Hackathon Guide UBC 26 - Google Docs.pdf. Read it with the Read tool before you design anything, and go back to it whenever you are unsure what judges want.
- A UBC team judge picks the DeFi track winner and the overall winners. They score five things: Technical Execution, Product & UX, Innovation, Impact & Potential, Demo. The DeFi track asks for projects that "make DeFi safer and more accessible through risk dashboards, simplified UX, or better onboarding" and that "compose with existing protocols". That is Airbag. The page should make it obvious.
- An Arc judge picks Best use of Arc. They want USDC as gas for predictable fees, Circle's tools, contract addresses, and experiences "where fees and balances are simple and stable". We have real proof: each bot move cost under 0.01 USDC of gas, paid in USDC, on Circle's Borrow Kit and Earn Kit, through our own AirbagGuard contract.
- Gemini picks the prediction-market bounty from the submission itself. It is the biggest prize we can win, and its winner pitches on stage. They want "analytics and visualizations that track how market odds move over time", bots "that act on prediction market data", and tools that "improve how users discover and understand markets". So Gemini's price ladder has to be on the page as a picture: the market's curve with the loan's line on it, and the odds over time.
- QuickNode picks the Streams bounty: a real-time app that reacts to on-chain events. Show the Stream waking the bot.
- Our mentor Turk, who trades prediction markets and crypto every day. His words:
  - "So much text. The frontend overall looks like ai slop"
  - "I need you to show me a viable use case"
  - Tell me: who would use this, why would they use this, what purpose does it serve.
  - Show me: nothing simulated. The on-chain deeds (testnet or mainnet contract address). The information in a visually aesthetic way and not via text: what this is, what my loan is up to.
  - Explore: a new frontend that does not look like AI slop, a landing page, mainnet contract deployment costs, any problems this may be solving.
Each of them should find their own thing in seconds, as a working part of the product, not as a logo wall or a paragraph.

WHAT YOU START FROM
Repo: C:\Users\matth\Desktop\ubc. Read AGENTS.md, README.md, docs/DEMO.md and docs/SUBMISSION.md first. The page is public/ (plain HTML, CSS, JS, hand-drawn SVG charts). The same code serves two sites: the simulator (anyone can press Push, and it is simulated) and the live bot at https://airbagged.me (a real loan on Arc Testnet; a visitor can only act with their own wallet). The page has to make sense on both.

WHAT DONE LOOKS LIKE
1. A judge with no wallet understands in 10 seconds what Airbag is and who it is for, and within a minute watches a real save. This is the hard part: on the live site a visitor without a wallet cannot trigger anything, and it must not be simulated. Build a replay of a real save from recorded on-chain data. README "Live proof" has the Nov 18 runs with times, amounts and transaction hashes. Label it as recorded and link every step to the explorer.
2. A landing page, with the dashboard one click away. The current link (/) must keep working on both sites.
3. A dashboard that shows pictures and numbers first, with explanations one click away. Three pictures matter most: bitcoin's price against the loan's liquidation line with the savings moving that line, Gemini's ladder with the line on it, and the odds over time.
4. On-chain proof you can see: contract addresses (lending market, savings vault, AirbagGuard, bot key), real transactions as links, and what each move cost in USDC.
5. A guided path for a connected wallet: open a loan, add savings, turn on protection, push it. Show which step the visitor is on.
6. A demo path. This page is also the stage for our 2 to 3 minute video (recorded Thursday night) and, if we are finalists, a 4 minute live demo with 2 minutes of questions. Every click should make a big visible change, nothing should need hunting for, and it should read well on a projector. Rewrite docs/DEMO.md on the branch to match the new page: the exact clicks and what to say.
7. Works on a phone, a laptop and a big screen, in light and dark, with no console errors.
8. Only after 1 to 7 are finished and checked: (a) a mainnet cost estimate built from our real testnet gas numbers, labelled as an estimate; (b) a read-only quote for hedging the loan with a Gemini prediction-market order. Ship (b) only if every number comes from real ladder data and the assumptions are stated on the page. Otherwise write what you found in the notes.

RULES
1. Work in a git worktree on a new branch called frontend-test, cut from origin/main. Edit files only inside that worktree. Never commit to main, never merge into main, never push main, never force-push, never open a PR. Push only with the branch named: git push origin frontend-test. Reason: every push to main redeploys the live bot and the judges' demo link while I'm asleep. You may merge new commits from origin/main into your branch, never the other way.
2. Few commits. One per finished milestone, about five for the whole night. No test commits and no work-in-progress commits: unsaved work is safe on disk. Push only when you commit.
3. Only run npm run sim. Never npm start: the live bot is hosted on that wallet and a second one would repeat its moves. Never run a script that sends a transaction. Never read or edit .env. Never touch MetaMask, Phantom or any wallet popup, and never touch Render, Namecheap or GitHub settings. No sign-ups and no purchases. You do not need to control my desktop.
4. Frontend only. Off limits: src/brain.mjs, src/brain.test.mjs, src/arc.ts, src/protector.ts, src/wallet-plan.ts, src/guard-*.mjs, contracts/, render.yaml, and what the start and sim scripts run. In src/server.ts you may only add read-only data the page needs, and what it takes to serve the new page.
5. The signing code in public/wallet.js (connect, execute, withWallet, the protection flow) was proven on-chain on Nov 18 and cannot be tested again without me signing in MetaMask. Do not rewrite it. Move its logic into a plain module unchanged and call it from the new page.
6. You may use React, Vite and Tailwind, and components from 21st.dev, changed however you like. Start with https://21st.dev/@mirukullacode/components/chart-line and https://21st.dev/@mirukullacode/components/tweenly-chart-kpi. Their code needs a sign-in, so look at them in my Chrome: screenshots for the look, the page's code view for the code. Two conditions:
   - Deploying must keep working with what Render runs today and no change to its settings: npm install, then npm start or npm run sim. Render may install without devDependencies. Either build during install or commit the built files. Prove it: clone the branch into a temp folder, set NODE_ENV=production, run npm install and npm run sim, and open the page.
   - Keep today's page working at /classic until I have tested the new one with MetaMask.
7. Follow AGENTS.md: never put server text into the page as HTML, colours come from tokens (light and dark), charts keep a table view, run npm test and npm run typecheck before each commit, no Claude co-author line. Where the new setup changes what AGENTS.md says (it says "no framework" today), update it on the branch.
8. Words on the page: short plain sentences, no em dashes, no hype words, explain a DeFi term the first time it shows. Every number must come from the live API, README "Live proof" or the crash replay. Aim for under 60 words on the first screen.
9. "Slop" means generic: anything that could sit unchanged on another crypto site. Each element should carry something only Airbag has: a real number, a real transaction, the real line.

HOW TO WORK
- The first time only, while I'm still here: do one of everything that could raise a permission prompt. Switch this session to Auto mode if it isn't already, keep my PC awake, create the worktree, run npm install there, start the simulator on a free port, open it in your browser, open the two 21st.dev pages in my Chrome, and push the new branch once (it equals main, so no commit is needed). Then tell me I can go to sleep and carry on without waiting for an answer.
- Before you design, look at how the best DeFi and prediction-market sites handle a first visit: for example Morpho, Aave, Uniswap, Hyperliquid, DeFi Saver (the closest thing to a competitor), Polymarket, Kalshi, Gemini's own prediction markets, and Arc's and Circle's sites. Look only: do not connect a wallet or sign up, and decline cookies. Write down what each does well in its first screen, how it shows risk, and how it gets a newcomer started. Borrow ideas, not their look.
- Keep notes in docs/FRONTEND_NIGHT.md on the branch: decisions, done, next, what I have to decide, what I have to test with MetaMask. Read it first every time you wake up, because your memory of the night may have been cut.
- Look at your own work. Take screenshots at 375, 1280 and 1920 wide, light and dark, after every big change. To see real data without a wallet, look up 0x5364A92e3e1a18190dFeC35ba03a74e8fd31Fb53 on the page. It is read-only and has a real protected loan.
- After the first full version, have a fresh agent that has not seen your work open it cold as each judge above and score the five criteria out of 10, with reasons and with what would make them close the tab. Fix what the page can fix. Do that once more at the end.
- Do not stop to ask me things. If a choice is mine, take the one that is easiest to undo and write it under "Decisions for Matthew".
- While work remains, never pause more than a minute between passes. When the list above passes and a review finds nothing worth changing, stop changing things: commit, push the branch, put the report at the top of the notes, and wait with long pauses. Polishing past that point makes it worse.

WHEN I SAY I'M AWAKE
Stop the loop. Tell me in under 20 lines: how to open it, what changed, the judges' scores and where we would still lose points, what only the team can fix, what you could not test, and what is waiting on me. Send me 4 to 6 screenshots.
