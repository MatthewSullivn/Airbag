// Types for guard-search.mjs.
export const MAX_BLOCKS_PER_SEARCH: number;
export function blockRanges(from: number, to: number, size?: number): [number, number][];
export function botIn(data: unknown): string | null;
export interface FoundGuard { guard: string; bot: string; block: number | null }
export function searchBotChanged(input: {
  getLogs: (from: number, to: number) => Promise<{ address?: unknown; data?: unknown; blockNumber?: unknown }[]>;
  from: number;
  to: number;
  size?: number;
  together?: number;
  maxRanges?: number;
  pause?: number;
}): Promise<{ found: FoundGuard[]; scannedTo: number; error: string | null }>;
