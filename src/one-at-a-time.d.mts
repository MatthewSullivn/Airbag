// Types for one-at-a-time.mjs.
/**
 * Wraps a job so it never runs twice at once. Calling the result while the job runs is skipped, unless called
 * with `true`: then the job runs once more when it ends.
 */
export function oneAtATime(job: () => Promise<unknown>): (keep?: boolean) => Promise<void>;
