// Prepares the transactions a CONNECTED wallet signs for itself:
//   open a loan, add savings, turn protection on or off, and the two demo moves (push, calm).
// The server only builds them (to + data). It never signs and never holds the visitor's key:
// the visitor's own wallet shows each one and sends it. Everything is checked against the chain first.
import { createPublicClient, encodeDeployData, encodeFunctionData, erc20Abi, http, maxUint256, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { CIRBTC, USDC, type Config } from "./config.js";
import { calmRepay, isAddress, isAmount, loanAfter, maxBorrow, pushBorrow } from "./wallet-math.mjs";
import { resolveIds, type WalletView } from "./wallet-view.js";
import { GUARD_ARTIFACT, GUARD_HEALTH_FLOOR, type Protector } from "./protector.js";

/** A new loan must start at least this healthy at the live price: the same level the bot repays to. */
export const OPEN_MIN_HEALTH = 1.25;
/** What the page suggests when someone opens a loan. */
export const OPEN_SUGGESTED_HEALTH = 1.4;
/** USDC is also Arc's gas, so a wallet always keeps this much out of savings. */
export const WALLET_GAS_RESERVE = 0.5;
/** What the page suggests as a new guard's daily cap, in USDC. */
export const GUARD_SUGGESTED_CAP = 50;

/** One transaction for the visitor's wallet. to = null deploys a contract. */
export interface Step { label: string; to: Address | null; data: Hex; value: "0x0" }
export interface Plan { action: string; summary: string; steps: Step[] }
/** A problem the visitor can fix (shown as is). Anything else is a server or chain error. */
export class PlanError extends Error {}

const MARKET_PARAMS = "(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams";
const MORPHO_ABI = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  `function supplyCollateral(${MARKET_PARAMS}, uint256 assets, address onBehalf, bytes data)`,
  `function borrow(${MARKET_PARAMS}, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256 assetsBorrowed, uint256 sharesBorrowed)`,
  `function repay(${MARKET_PARAMS}, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256 assetsRepaid, uint256 sharesRepaid)`,
  "function isAuthorized(address authorizer, address authorized) view returns (bool)",
  "function setAuthorization(address authorized, bool newIsAuthorized)",
]);
const VAULT_ABI = parseAbi(["function deposit(uint256 assets, address onBehalf) returns (uint256 shares)"]);

const cents = (x: number) => Math.floor(x * 100 + 1e-9) / 100;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

/** What the page offers a wallet right now: how much it could lock, borrow and save. */
export function offersFor(v: WalletView) {
  const borrowAt = (minHealth: number) =>
    cents(maxBorrow({ collateral: v.loan?.collateral ?? 0, debt: v.loan?.debt ?? 0, addCollateral: v.cirbtc, price: v.market.priceUsed, oraclePrice: v.market.oraclePrice, lltv: v.market.lltv, minHealth }));
  return {
    collateralFree: v.cirbtc,
    suggestBorrow: borrowAt(OPEN_SUGGESTED_HEALTH),
    maxBorrow: borrowAt(OPEN_MIN_HEALTH),
    minHealth: OPEN_MIN_HEALTH,
    savingsMax: Math.max(0, cents(v.usdc - WALLET_GAS_RESERVE)),
    suggestCap: GUARD_SUGGESTED_CAP,
  };
}

export function makeWalletPlanner(
  cfg: Config,
  readWalletView: (address: string, opts?: { fresh?: boolean }) => Promise<WalletView>,
  ids: { marketId: string | null; vault: string | null },
  protector: Protector,
) {
  const client = createPublicClient({ chain: arcTestnet, transport: http(cfg.rpcUrl) });
  const morpho = cfg.morphoAddress as Address;
  const { marketId, vault } = resolveIds(ids);
  let params: { loanToken: Address; collateralToken: Address; oracle: Address; irm: Address; lltv: bigint } | null = null;

  const marketParams = async () => {
    if (!params) {
      const p = await client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] });
      params = { loanToken: p[0], collateralToken: p[1], oracle: p[2], irm: p[3], lltv: p[4] };
    }
    return params;
  };
  const allowance = (token: Address, owner: Address, spender: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
  const approve = (label: string, token: Address, spender: Address, amount: bigint): Step => ({ label, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value: "0x0" });
  const borrowStep = async (label: string, address: Address, usdc: string): Promise<Step> => ({
    label,
    to: morpho,
    data: encodeFunctionData({ abi: MORPHO_ABI, functionName: "borrow", args: [await marketParams(), parseUnits(usdc, 6), 0n, address, address] }),
    value: "0x0",
  });
  const loanOf = (v: WalletView) => ({ collateral: v.loan?.collateral ?? 0, debt: v.loan?.debt ?? 0, price: v.market.priceUsed, oraclePrice: v.market.oraclePrice, lltv: v.market.lltv });

  /** Lock cirBTC and borrow USDC, straight on the lending contract. Also works for adding to an existing loan. */
  async function openLoan(address: Address, collateral: unknown, borrow: unknown): Promise<Plan> {
    if (!isAmount(borrow, 6)) throw new PlanError("Enter how much USDC to borrow, with at most 6 decimals.");
    const addsCollateral = collateral !== "" && collateral != null && Number(collateral) !== 0;
    if (addsCollateral && !isAmount(collateral, 8)) throw new PlanError("Enter how much cirBTC to lock, with at most 8 decimals.");
    const v = await readWalletView(address, { fresh: true });
    const addCollateral = addsCollateral ? Number(collateral) : 0, addDebt = Number(borrow);
    if (addCollateral > v.cirbtc + 1e-12) throw new PlanError(`This wallet has ${v.cirbtc} cirBTC free. Get more from the faucet or lock less.`);
    const loan = { ...loanOf(v), addCollateral };
    if (!(loan.collateral + addCollateral > 0)) throw new PlanError("Lock some cirBTC first. A loan needs collateral.");
    const max = cents(maxBorrow({ ...loan, minHealth: OPEN_MIN_HEALTH }));
    if (addDebt > max + 1e-9) throw new PlanError(max >= 0.01 ? `That is too much. With this collateral you can borrow up to ${max.toFixed(2)} USDC and still start at health ${OPEN_MIN_HEALTH} or better.` : "This collateral cannot carry more debt. Lock more cirBTC first.");
    const after = loanAfter({ ...loan, addDebt });

    const p = await marketParams();
    const steps: Step[] = [];
    if (addCollateral > 0) {
      const raw = parseUnits(collateral as string, 8);
      if ((await allowance(CIRBTC, address, morpho)) < raw) steps.push(approve(`Let the lending contract take ${collateral} cirBTC`, CIRBTC, morpho, raw));
      steps.push({ label: `Lock ${collateral} cirBTC as collateral`, to: morpho, data: encodeFunctionData({ abi: MORPHO_ABI, functionName: "supplyCollateral", args: [p, raw, address, "0x"] }), value: "0x0" });
    }
    steps.push(await borrowStep(`Borrow ${borrow} USDC`, address, borrow));
    return {
      action: "open-loan",
      summary: `Loan after this: ${after.debt.toFixed(2)} USDC owed against ${+after.collateral.toFixed(8)} cirBTC. Health ${after.health.toFixed(2)}. You lose the bitcoin if BTC falls under ${usd(after.line)}.`,
      steps,
    };
  }

  /** Put the wallet's own USDC into the savings vault: the money the bot can later move into the loan. */
  async function addSavings(address: Address, amount: unknown): Promise<Plan> {
    if (!isAmount(amount, 6)) throw new PlanError("Enter how much USDC to save, with at most 6 decimals.");
    const v = await readWalletView(address, { fresh: true });
    const max = Math.max(0, cents(v.usdc - WALLET_GAS_RESERVE));
    if (Number(amount) > max + 1e-9) throw new PlanError(`This wallet has ${v.usdc.toFixed(2)} USDC. USDC also pays for gas on Arc, so you can save up to ${max.toFixed(2)}.`);
    const raw = parseUnits(amount, 6);
    const steps: Step[] = [];
    if ((await allowance(USDC, address, vault)) < raw) steps.push(approve(`Let the savings vault take ${amount} USDC`, USDC, vault, raw));
    steps.push({ label: `Deposit ${amount} USDC into savings`, to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "deposit", args: [raw, address] }), value: "0x0" });
    return { action: "add-savings", summary: `Savings after this: ${(v.savings + Number(amount)).toFixed(2)} USDC, still yours and earning interest.`, steps };
  }

  /** Step 1 of turning protection on: the wallet creates its own guard, naming our bot key as the only caller. */
  async function protect(address: Address, cap: unknown): Promise<Plan> {
    const why = protector.why();
    if (why || !protector.botAddress) throw new PlanError(why ?? "This server cannot protect wallets.");
    if (!isAmount(cap, 2) || Number(cap) < 1 || Number(cap) > 100_000) throw new PlanError("Enter the most the bot may move per day, between 1 and 100000 USDC.");
    const v = await readWalletView(address, { fresh: true });
    if (!v.loan) throw new PlanError("Open a loan first. There is nothing to protect yet.");
    if (v.savings < 0.01) throw new PlanError("Add savings first. Protection works by moving your savings into your loan, so there has to be some.");
    if (protector.forOwner(address)) throw new PlanError("Airbag is already protecting this wallet.");
    const data = encodeDeployData({
      abi: GUARD_ARTIFACT.abi,
      bytecode: GUARD_ARTIFACT.bytecode,
      args: [address, protector.botAddress, morpho, vault, marketId, parseUnits(cap, 6), parseUnits(GUARD_HEALTH_FLOOR, 18)],
    });
    return {
      action: "protect",
      summary: `Your guard will let the bot move at most ${cap} USDC a day, only between your savings and your own loan. You stay its owner: you can pause it or cut it off at any time.`,
      steps: [{ label: "Create your AirbagGuard contract", to: null, data, value: "0x0" }],
    };
  }

  /** Step 2: the wallet gives its new guard the two permissions. Nothing can move before both are signed. */
  async function protectFinish(address: Address, guard: unknown): Promise<Plan> {
    if (!isAddress(guard)) throw new PlanError("The guard's address is missing.");
    let g;
    try { g = await protector.verify(guard); } catch (e) { throw new PlanError((e as Error).message); }
    if (g.owner.toLowerCase() !== address.toLowerCase()) throw new PlanError("That guard belongs to a different wallet.");
    const steps: Step[] = [];
    if ((await allowance(vault, address, g.guard)) < maxUint256 / 2n) steps.push(approve("Let your guard move your savings (only into your own loan)", vault, g.guard, maxUint256));
    if (!(await client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "isAuthorized", args: [address, g.guard] })))
      steps.push({ label: "Let your guard borrow on your loan (only back into your own savings)", to: morpho, data: encodeFunctionData({ abi: MORPHO_ABI, functionName: "setAuthorization", args: [g.guard, true] }), value: "0x0" });
    return { action: "protect-finish", summary: `Your guard is ${g.guard}. Two permissions and it is on.`, steps };
  }

  /** Cut the guard off: take both permissions away. The loan and the savings stay exactly as they are. */
  async function unprotect(address: Address): Promise<Plan> {
    const loan = protector.forOwner(address);
    if (!loan) throw new PlanError("Airbag is not protecting this wallet.");
    return {
      action: "unprotect",
      summary: "After this the bot can no longer touch your savings or your loan. Nothing else changes.",
      steps: [
        approve("Take back your guard's access to your savings", vault, loan.guard, 0n),
        { label: "Take back your guard's access to your loan", to: morpho, data: encodeFunctionData({ abi: MORPHO_ABI, functionName: "setAuthorization", args: [loan.guard, false] }), value: "0x0" },
      ],
    };
  }

  /** Demo: borrow more until the loan is risky, so the bot has something to save. */
  async function push(address: Address): Promise<Plan> {
    const v = await readWalletView(address, { fresh: true });
    if (!v.loan) throw new PlanError("Open a loan first.");
    const amount = pushBorrow({ ...loanOf(v), pushHealth: cfg.pushHealth });
    if (amount < 0.01) throw new PlanError("The loan is already at the edge.");
    const after = loanAfter({ ...loanOf(v), addDebt: amount });
    return {
      action: "push",
      summary: `This borrows ${amount.toFixed(2)} USDC more. Health drops to ${after.health.toFixed(2)} and your line rises to ${usd(after.line)}. Then keep your hands off.`,
      steps: [await borrowStep(`Borrow ${amount.toFixed(2)} USDC more`, address, amount.toFixed(2))],
    };
  }

  /** Demo: repay from the wallet's own USDC until the loan is calm, so the bot gives the savings back. */
  async function calm(address: Address): Promise<Plan> {
    const v = await readWalletView(address, { fresh: true });
    if (!v.loan) throw new PlanError("There is no loan to calm down.");
    const amount = calmRepay({ collateral: v.loan.collateral, debt: v.loan.debt, price: v.market.priceUsed, lltv: v.market.lltv, calmHealth: cfg.resetHealth, spendable: v.usdc - WALLET_GAS_RESERVE });
    if (amount < 0.01) throw new PlanError(v.loan.health >= cfg.resetHealth - 0.005 ? "The loan is already calm." : "Not enough USDC in the wallet to calm it down.");
    const raw = parseUnits(amount.toFixed(2), 6);
    const steps: Step[] = [];
    if ((await allowance(USDC, address, morpho)) < raw) steps.push(approve(`Let the lending contract take ${amount.toFixed(2)} USDC`, USDC, morpho, raw));
    steps.push({ label: `Repay ${amount.toFixed(2)} USDC from your wallet`, to: morpho, data: encodeFunctionData({ abi: MORPHO_ABI, functionName: "repay", args: [await marketParams(), raw, 0n, address, "0x"] }), value: "0x0" });
    return { action: "calm", summary: `This repays ${amount.toFixed(2)} USDC from your wallet. Health rises to about ${cfg.resetHealth}.`, steps };
  }

  return async function plan(action: string, body: Record<string, unknown>): Promise<Plan> {
    const address = body?.address;
    if (!isAddress(address)) throw new PlanError("Connect a wallet first.");
    if (action === "open-loan") return openLoan(address, body.collateral, body.borrow);
    if (action === "add-savings") return addSavings(address, body.amount);
    if (action === "protect") return protect(address, body.cap);
    if (action === "protect-finish") return protectFinish(address, body.guard);
    if (action === "unprotect") return unprotect(address);
    if (action === "push") return push(address);
    if (action === "calm") return calm(address);
    throw new PlanError("Unknown action.");
  };
}
