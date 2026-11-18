export function publicDemoOn(mode: string, flag: unknown): boolean;
export const PUBLIC_ACTIONS: readonly string[];
export function publicAllows(action: string): boolean;
export function makeRateLimiter(max: number, windowMs: number): (now?: number) => boolean;
