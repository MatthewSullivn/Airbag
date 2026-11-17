// Types for brain.mjs so the TypeScript side stays strict.
export interface LadderPoint { strike: number; pAbove: number }
export interface Loan { debt: number; collateral: number; btcPrice: number; lltv?: number }
export interface Rule { actBelowHealth: number; repayToHealth: number; giveBackAbove: number; giveBackFloor: number }
export interface Tail { a: number; b: number; median: number; sigma: number; points: number }
export interface OddsDetail { odds: number; source: "quoted" | "estimated"; ticker?: string }
export type Decision =
  | { action: "repay" | "out_of_savings"; repay: number; odds: number | null; health: number; line: number; targetLine: number }
  | { action: "give_back"; borrow: number; odds: number | null; health: number; line: number }
  | { action: "nothing"; odds: number | null; health: number; line: number };

export const LLTV: number;
export const RULE: Readonly<Rule>;
export function ladderFromEvent(event: unknown): LadderPoint[];
export function fetchLadder(ticker: string): Promise<LadderPoint[]>;
export function fetchEvent(ticker: string): Promise<{ ticker: string; title: string; status: string; expiryDate: string; volume: number | null; ladder: LadderPoint[] }>;
export function chanceBelow(ladder: LadderPoint[], price: number): number | null;
export function oddsLoanDies(ladder: LadderPoint[], liqPrice: number): number | null;
export function liqPrice(debt: number, collateral: number, lltv?: number): number;
export function health(debt: number, collateral: number, btcPrice: number, lltv?: number): number;
export function safeLine(ladder: LadderPoint[], limit: number): number | null;
export function normCdf(z: number): number;
export function normInv(p: number): number;
export function fitTail(ladder: LadderPoint[]): Tail | null;
export function chanceBelowEst(ladder: LadderPoint[], price: number, tail?: Tail | null): { p: number; source: "quoted" | "estimated" } | null;
export function oddsLoanDiesEst(ladder: LadderPoint[], line: number, tail?: Tail | null): OddsDetail | null;
export function makeOddsModel(events: { ticker: string; ladder: LadderPoint[] }[]): {
  oddsAt: (line: number) => number | null;
  detail: (line: number) => OddsDetail | null;
  tails: ({ ticker: string } & Partial<Tail>)[];
};
export function highestSafeLine(oddsAt: (line: number) => number | null, limit: number, top: number, opts?: { floor?: number; steps?: number }): number;
export function decide(
  loan: Loan,
  ladder: LadderPoint[] | null,
  savings: number,
  inLoan: number,
  limit: number,
  opts?: { oddsAt?: (line: number) => number | null; rule?: Partial<Rule> },
): Decision;
