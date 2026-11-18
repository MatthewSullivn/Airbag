// Pure helpers for the read-only wallet lookup (GET /api/wallet/:address). No dependencies.

/** A wallet address: 0x + 40 hex characters. */
export const isAddress = (x) => typeof x === "string" && /^0x[0-9a-fA-F]{40}$/.test(x);

/**
 * Morpho Blue: what a borrower owes, in the loan token's smallest unit, from their borrow shares.
 * Rounded up like Morpho does for debt (virtual shares 1e6, virtual assets 1). BigInt in, BigInt out.
 */
export function debtFromShares(shares, totalBorrowAssets, totalBorrowShares) {
  if (shares === 0n) return 0n;
  const assets = totalBorrowAssets + 1n;
  const total = totalBorrowShares + 1_000_000n;
  return (shares * assets + total - 1n) / total;
}

/** An amount typed by a visitor: digits with at most `decimals` decimal places, and more than zero. */
export function isAmount(x, decimals) {
  return typeof x === "string" && new RegExp(`^\\d{1,12}(\\.\\d{1,${decimals}})?$`).test(x) && Number(x) > 0;
}

/**
 * The loan after adding collateral and debt. Plain numbers (BTC, USDC).
 * health uses `price` (the live BTC price Airbag shows); onChainHealth uses the lending market's own oracle.
 */
export function loanAfter({ collateral, debt, addCollateral = 0, addDebt = 0, price, oraclePrice, lltv }) {
  const c = collateral + addCollateral, d = debt + addDebt;
  return {
    collateral: c,
    debt: d,
    health: d > 0 ? (c * price * lltv) / d : Infinity,
    onChainHealth: d > 0 ? (c * oraclePrice * lltv) / d : Infinity,
    line: c > 0 ? d / (c * lltv) : 0,
  };
}

/**
 * Most USDC a wallet can still borrow while starting at health `minHealth` or better at the live price,
 * and staying clear of the lending contract's own limit (on-chain health `minOnChain`).
 */
export function maxBorrow({ collateral, debt, addCollateral = 0, price, oraclePrice, lltv, minHealth, minOnChain = 1.02 }) {
  const c = collateral + addCollateral;
  const cap = Math.min((c * price * lltv) / minHealth, (c * oraclePrice * lltv) / minOnChain);
  return Math.max(0, cap - debt);
}

const floorCents = (x) => Math.floor(x * 100 + 1e-9) / 100;

/**
 * Demo "push it to the edge": how much more to borrow so health drops to `pushHealth` at the live price
 * (never past what the lending contract itself allows). 0 when the loan is already there.
 */
export function pushBorrow({ collateral, debt, price, oraclePrice, lltv, pushHealth, minOnChain = 1.02 }) {
  return floorCents(maxBorrow({ collateral, debt, price, oraclePrice, lltv, minHealth: pushHealth, minOnChain }));
}

/**
 * Demo "calm it down": how much to repay from the wallet so health rises to `calmHealth` at the live price,
 * limited by what the wallet can spend. 0 when the loan is already calm or the wallet is empty.
 */
export function calmRepay({ collateral, debt, price, lltv, calmHealth, spendable }) {
  const target = (collateral * price * lltv) / calmHealth;
  return Math.max(0, floorCents(Math.min(debt - target, spendable, debt)));
}
