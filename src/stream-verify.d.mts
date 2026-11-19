export interface ReceiptLike {
  from?: string | null;
  to?: string | null;
  logs?: readonly { address?: string; topics?: readonly string[] }[];
}
export function isTxHash(x: unknown): x is string;
export function describeReceipt(receipt: ReceiptLike | null | undefined, ids: { wallet: string; marketId: string; /** Wallets that turned protection on from the page. */ connected?: readonly string[] }): { kind: string; detail: string } | null;
