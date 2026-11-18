// Types for core.js (kept as plain JavaScript on purpose: see the note at the top of that file).
export interface Eip1193 {
  request(args: { method: string; params?: unknown }): Promise<any>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
}
export interface WalletApp { name: string; provider: Eip1193 }
export interface StepHandle { sent(hash: string): void; done(hash: string): void }
export interface StepUi { summary(text: string): void; step(label: string): StepHandle }
export interface Receipt { status: string; contractAddress?: string | null }

export const ARC: { chainId: string; chainName: string; rpcUrls: string[]; blockExplorerUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number } };
export const CIRBTC: { address: string; symbol: string; decimals: number };
export const addArcRequest: { method: string; params: unknown };
export const addCirbtcRequest: { method: string; params: unknown };
export function isAddress(x: unknown): x is string;
export function askWallets(): void;
export function listWallets(): Promise<WalletApp[]>;
export function requestAccount(provider: Eip1193): Promise<string>;
export function recall(owner: string): string | null;
export function remember(owner: string, guard: string | null): void;
export function post<T = any>(path: string, body: unknown): Promise<T>;
export function reason(e: unknown): string;
export function ensureArc(wallet: Eip1193): Promise<void>;
export function confirmed(wallet: Eip1193, hash: string): Promise<Receipt>;
export function execute(wallet: Eip1193, from: string, action: string, body: Record<string, unknown>, ui: StepUi): Promise<Receipt[]>;
export function turnOnProtection(wallet: Eip1193, from: string, cap: string, ui: StepUi): Promise<string>;
export function turnOffProtection(wallet: Eip1193, from: string, knownGuard: string | null | undefined, ui: StepUi): Promise<void>;
