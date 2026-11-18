// Prepares the transactions a CONNECTED wallet signs for itself: open a loan, add savings.
// The server only builds them (to + data). It never signs and never holds the visitor's key:
// the visitor's own wallet shows each one and sends it. Everything is checked against the chain first.
import { createPublicClient, encodeFunctionData, erc20Abi, http, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { CIRBTC, USDC, type Config } from "./config.js";
import { isAddress, isAmount, loanAfter, maxBorrow } from "./wallet-math.mjs";
import { resolveIds, type WalletView } from "./wallet-view.js";

/** A new loan must start at least this healthy at the live price: the same level the bot repays to. */
export const OPEN_MIN_HEALTH = 1.25;
/** What the page suggests when someone opens a loan. */
export const OPEN_SUGGESTED_HEALTH = 1.4;
/** USDC is also Arc's gas, so a wallet always keeps this much out of savings. */
export const WALLET_GAS_RESERVE = 0.5;

export interface Step { label: string; to: Address; data: Hex; value: "0x0" }
export interface Plan { action: string; summary: string; steps: Step[] }
/** A problem the visitor can fix (shown as is). Anything else is a server or chain error. */
export class PlanError extends Error {}

const MORPHO_ABI = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supplyCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
]);
const VAULT_ABI = parseAbi(["function deposit(uint256 assets, address onBehalf) returns (uint256 shares)"]);

const cents = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

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
  };
}

export function makeWalletPlanner(cfg: Config, readWalletView: (address: string, opts?: { fresh?: boolean }) => Promise<WalletView>, ids: { marketId: string | null; vault: string | null }) {
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

  /** Lock cirBTC and borrow USDC, straight on the lending contract. Also works for adding to an existing loan. */
  async function openLoan(address: Address, collateral: unknown, borrow: unknown): Promise<Plan> {
    if (!isAmount(borrow, 6)) throw new PlanError("Enter how much USDC to borrow, with at most 6 decimals.");
    const addsCollateral = collateral !== "" && collateral != null && Number(collateral) !== 0;
    if (addsCollateral && !isAmount(collateral, 8)) throw new PlanError("Enter how much cirBTC to lock, with at most 8 decimals.");
    const v = await readWalletView(address, { fresh: true });
    const addCollateral = addsCollateral ? Number(collateral) : 0, addDebt = Number(borrow);
    if (addCollateral > v.cirbtc + 1e-12) throw new PlanError(`This wallet has ${v.cirbtc} cirBTC free. Get more from the faucet or lock less.`);
    const loan = { collateral: v.loan?.collateral ?? 0, debt: v.loan?.debt ?? 0, addCollateral, price: v.market.priceUsed, oraclePrice: v.market.oraclePrice, lltv: v.market.lltv };
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
    steps.push({ label: `Borrow ${borrow} USDC`, to: morpho, data: encodeFunctionData({ abi: MORPHO_ABI, functionName: "borrow", args: [p, parseUnits(borrow, 6), 0n, address, address] }), value: "0x0" });
    return {
      action: "open-loan",
      summary: `Loan after this: ${after.debt.toFixed(2)} USDC owed against ${+after.collateral.toFixed(8)} cirBTC. Health ${after.health.toFixed(2)}. You lose the bitcoin if BTC falls under $${Math.round(after.line).toLocaleString("en-US")}.`,
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

  return async function plan(action: string, body: Record<string, unknown>): Promise<Plan> {
    const address = body?.address;
    if (!isAddress(address)) throw new PlanError("Connect a wallet first.");
    if (action === "open-loan") return openLoan(address, body.collateral, body.borrow);
    if (action === "add-savings") return addSavings(address, body.amount);
    throw new PlanError("Unknown action.");
  };
}
