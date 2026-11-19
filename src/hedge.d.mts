// Types for hedge.mjs.
export interface BetPrice { strike: number; buyYes: number | null; buyNo: number | null; symbol: string | null }
export interface HedgeQuote { strike: number; symbol: string | null; price: number; penaltyShare: number; loss: number; cost: number }
export function selloffFactor(lltv: number): number;
export function betsFromEvent(event: unknown): BetPrice[];
export interface HedgeOrder { symbol: string; orderType: "limit"; side: "buy"; outcome: "no"; quantity: string; price: string; timeInForce: "good-til-cancel" }
export function hedgeOrder(quote: HedgeQuote | null | undefined): HedgeOrder | null;
export function hedgeQuote(input: { bets: BetPrice[] | undefined | null; line: number; debt: number; lltv: number }): HedgeQuote | null;
