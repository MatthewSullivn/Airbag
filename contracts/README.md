# AirbagGuard

**The problem it fixes.** Today the bot's server holds the owner's private key, so whoever gets that key gets the loan and the savings. AirbagGuard splits the two: the owner keeps their key, and the bot gets its own key that can only do two things, both on the owner's own accounts.

| Bot calls | What happens | Where the money can go |
|---|---|---|
| `save(amount)` | withdraws the owner's savings and repays the owner's loan | only into the owner's loan |
| `giveBack(amount)` | borrows on the owner's loan and deposits into the owner's savings, refusing to leave health under the floor | only into the owner's savings |

On-chain limits the bot can't change:
- **Daily cap** on USDC moved, both directions added together (default 25 USDC).
- **Health floor** for give-backs (default 1.15, on the lending market's own oracle price). The bot's own rule stops at 1.30 on the live price; this is the backstop if the bot is wrong or the key leaks.
- **Only the owner** can pause it, swap the bot key, change the limits, or sweep stray tokens. The owner can also cut it off completely by revoking the vault allowance or the Morpho authorization.

The guard never keeps money: USDC passes through it inside one transaction. A fuzz test checks that whatever the bot calls, the bot ends with nothing and the owner's savings minus debt never changes.

## What the owner signs once

1. `vault.approve(guard, max)`: the guard may withdraw the owner's savings (only into the owner's loan).
2. `morpho.setAuthorization(guard, true)`: the guard may borrow on the owner's loan (only into the owner's savings).

`npm run guard:deploy` does the deploy and both of these.

## Commands (from the repo root)

```bash
npm run guard:test             # 16 Foundry tests, incl. 512 fuzz runs
npm run guard:build            # needed before deploy/try (writes contracts/out/)
npm run guard:deploy           # deploy on Arc Testnet + the two owner signatures + 1 USDC gas to a new bot key
npm run guard:try -- 0.25      # the BOT key runs save(0.25) and giveBack(0.25), and a stranger is refused
npm run guard:limits           # show the cap and health floor; `-- 200` sets the cap to 200 USDC a day (owner only)
USE_GUARD=true npm start       # run the bot through the guard (or set USE_GUARD=true in .env)
npm run demo:push              # owner's machine: make the loan risky when the server holds no wallet key
npm run demo:reset             # owner's machine: calm it down again
```

Needs Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`, or `npm i -g @foundry-rs/forge`). On Windows the npm package's setup script fails under cmd, so point npm at Git Bash: `npm i --no-save --script-shell "C:\Program Files\Git\usr\bin\bash.exe" @foundry-rs/forge`.

`guard:deploy` uses `PRIVATE_KEY` as the owner, and makes a separate `GUARD_BOT_KEY` in `.env` (never printed). Use your own wallet and loan (`npm run wallet:new`, faucet, `npm run loan:open`), not the team bot wallet, so you don't collide with the live bot.

## Status

- ✅ 16 Foundry tests pass against mocks of Morpho Blue, the vault and USDC (`test/`).
- ✅ `guard:deploy` and `guard:try` ran end to end on a local chain with the same chain id as Arc Testnet.
- ✅ **Live on Arc Testnet (Nov 18, 2026)** at `0x895fa892dc4ff752ec9114760201f4751c106bf3`. The real Earn Kit vault (a Morpho Vault V2) accepts a contract withdrawing on the owner's behalf. The bot key ran `save(0.25)` and `giveBack(0.25)`, received nothing, and a stranger was refused. The links are in the main README's "Live proof".
- ✅ **The bot can run through the guard.** With `USE_GUARD=true`, `src/arc.ts` sends `save()` and `giveBack()` signed by `GUARD_BOT_KEY` (tested live Nov 18, links in the main README). `PRIVATE_KEY` is then optional on the server.
- ✅ **A hosted bot runs in guard mode with no wallet key** (https://airbag-live.onrender.com, Nov 18). It saved a pushed loan through the guard 4 s after the push.
- ✅ **Any wallet can get its own guard from the page** (Connect wallet, then Turn on protection). Tested live Nov 18 with a third wallet: it created guard `0xc7ae194fc194f54f999df6cb44c3199264d768f7` from the page, and the hosted bot saved its loan through it 3 s after a push, then gave the savings back. Links in the main README.
- ⏳ The first bot wallet still signs with its own key.

Compiled with solc 0.8.28 for EVM `paris` (no newer opcodes, the safe choice for a young chain).
