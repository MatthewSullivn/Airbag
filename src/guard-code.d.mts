export type ImmutableRefs = Record<string, { start: number; length: number }[]>;
export function maskImmutables(codeHex: string | null | undefined, refs: ImmutableRefs | null | undefined): string;
export function sameContract(onChainCode: string | null | undefined, artifact: { deployedBytecode: string; immutableReferences: ImmutableRefs }): boolean;
export function insideLoan(events: { kind: "saved" | "givenBack" | string; usdc: number }[]): number;
