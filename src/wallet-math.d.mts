export function isAddress(x: unknown): x is `0x${string}`;
export function debtFromShares(shares: bigint, totalBorrowAssets: bigint, totalBorrowShares: bigint): bigint;
