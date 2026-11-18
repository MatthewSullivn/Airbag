export function isAddress(x: unknown): x is `0x${string}`;
export function debtFromShares(shares: bigint, totalBorrowAssets: bigint, totalBorrowShares: bigint): bigint;
export function isAmount(x: unknown, decimals: number): x is string;
export function loanAfter(loan: { collateral: number; debt: number; addCollateral?: number; addDebt?: number; price: number; oraclePrice: number; lltv: number }): {
  collateral: number;
  debt: number;
  health: number;
  onChainHealth: number;
  line: number;
};
export function maxBorrow(loan: { collateral: number; debt: number; addCollateral?: number; price: number; oraclePrice: number; lltv: number; minHealth: number; minOnChain?: number }): number;
export function pushBorrow(loan: { collateral: number; debt: number; price: number; oraclePrice: number; lltv: number; pushHealth: number; minOnChain?: number }): number;
export function calmRepay(loan: { collateral: number; debt: number; price: number; lltv: number; calmHealth: number; spendable: number }): number;
