// Runs one job at a time. Pure logic, no dependencies.
//
// The check of the protected loans is started by a timer and, since Nov 19, 2026, also by a QuickNode Stream
// delivery ("something just happened in our lending market"). Two checks must never run together: both could
// decide to move the same money. So:
//   run()       while a check is running, this call is skipped. That is what a timer tick wants.
//   run(true)   while a check is running, this call is remembered, and the job runs once more when it ends.
//               That is what a wake-up wants: the running check may have read the chain before the change landed.
// However many wake-ups arrive during one check, only one more check follows.

/** @param {() => Promise<unknown>} job */
export function oneAtATime(job) {
  let running = false, again = false;
  /** @param {boolean} [keep] remember this call if the job is busy */
  const run = async (keep = false) => {
    if (running) {
      if (keep) again = true;
      return;
    }
    running = true;
    try {
      await job();
    } finally {
      running = false;
      if (again) {
        again = false;
        // not awaited: the caller of the first run does not wait for the follow-up
        void run().catch(() => {});
      }
    }
  };
  return run;
}
