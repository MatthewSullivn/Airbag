// Types for market-history.mjs.
/** [time in ms, chance bitcoin ends at or above the bet's price (last traded), contracts traded that hour] */
export type HistoryPoint = [number, number, number];
export interface BetHistory { strike: number; symbol: string; points: HistoryPoint[] }
export interface Activity { hours: number; volume: number; low: number | null; high: number | null }
export function pointsFromCandles(rows: unknown): HistoryPoint[];
export function activity(points: HistoryPoint[] | null | undefined): Activity;
export function worthDrawing<T extends { strike: number; points: HistoryPoint[] }>(series: T[] | null | undefined, spot: number | null | undefined, opts?: { minHours?: number; max?: number }): (T & { activity: Activity })[];
