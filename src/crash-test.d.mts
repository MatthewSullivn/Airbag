// Types for crash-test.mjs.
export interface CrashTestFacts {
  /** The ride, day by day: a few calm days, the day Airbag first paid the loan down, and the day the loan left alone was sold. */
  days: { date: string; low: number }[];
  /** Which of `days` Airbag first paid the loan down on. */
  saveIndex: number;
  /** The last of `days`: the day the loan left alone was sold, and bitcoin's low that day. */
  crash: { date: string; low: number };
  /** The price below which the loan left alone is sold. */
  line0: number;
  /** What was borrowed. */
  debt0: number;
  /** Bitcoin left (of 1) after the sale. */
  btcKept: number;
  /** Days between Airbag's first move and the sale. */
  daysEarly: number;
}
export function crashTestFacts(replay: unknown): CrashTestFacts | null;
