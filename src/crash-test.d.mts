// Types for crash-test.mjs.
export interface StoryDay {
  date: string;
  /** Bitcoin's daily candle, in dollars. */
  open: number;
  high: number;
  low: number;
  close: number;
  /** The price below which the loan with Airbag would be sold that day. */
  line: number;
  /** Savings Airbag had in the loan that day, in dollars. */
  inLoan: number;
}
export interface CrashStory {
  /** The days around the crash, oldest first. */
  days: StoryDay[];
  /** Which of `days` Airbag first paid the loan down on. */
  saveIndex: number;
  /** Which of `days` the loan left alone was sold on. */
  crashIndex: number;
  /** The price below which the loan left alone is sold. */
  line0: number;
  /** What was borrowed. */
  debt0: number;
  /** The savings Airbag could use. */
  savings: number;
  /** Bitcoin left (of 1) after the sale. */
  btcKept: number;
  /** Days between Airbag's first move and the sale. */
  daysEarly: number;
}
export function crashStory(replay: unknown): CrashStory | null;
export interface Candle { open: number; high: number; low: number; close: number }
export function candleSoFar(day: Candle, f: number): Candle;

/** The days the story turns on, as counts of candles: all of them, the calm, Airbag's first move, the crash. */
export interface StoryKeys { N: number; calm: number; save: number; crash: number }
/** How many candles are on the chart (the last one may be half made), and whether Airbag is on. */
export interface Scene { n: number; airbag: boolean }
/** Everything the chart and its read-outs show in one scene. */
export interface Frame {
  N: number;
  /** Candles that are complete. */
  full: number;
  /** Whether one more is being made. */
  forming: boolean;
  /** The day on screen now. */
  cur: number;
  /** That day's candle so far, and bitcoin's price at this moment. */
  candle: Candle;
  price: number;
  /** The price below which the bitcoin is sold, as drawn for day i, and for the day on screen. */
  levelAt(i: number): number;
  level: number;
  /** Without Airbag: the bitcoin has been sold. With Airbag: bitcoin has reached its low on the crash day. */
  sold: boolean;
  landed: boolean;
  /** Whether the airbag is drawn, and the savings in the loan at this moment. */
  cushion: boolean;
  inLoan: number;
}
export const OPEN_AT: number;
export const STORY_END: number;
export const INTRO_SECONDS: number;
export function storyKeys(story: CrashStory): StoryKeys;
export function sceneAt(s: number, keys: StoryKeys): Scene;
export function introAt(t: number, keys: StoryKeys): number;
export function airbagOpen(scene: Scene, keys: StoryKeys): boolean;
export function frameOf(story: CrashStory, scene: Scene, pop: number): Frame;
