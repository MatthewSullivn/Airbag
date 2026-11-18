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
