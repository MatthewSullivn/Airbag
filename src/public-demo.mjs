// Public demo: lets anyone press the demo buttons on a hosted SIMULATOR, so judges can try a save
// themselves without the key. It can never turn on for the live bot, because the live bot moves
// real (testnet) money. Plain JS with no dependencies, like brain.mjs, so it is easy to test.

/** On only when the server runs the simulator AND PUBLIC_DEMO=true. Live mode always says no. */
export function publicDemoOn(mode, flag) {
  return mode === "sim" && String(flag ?? "").trim().toLowerCase() === "true";
}

/** Which demo actions the public may use. Pause is left out so one visitor can't freeze the bot for everyone. */
export const PUBLIC_ACTIONS = Object.freeze(["check-key", "push", "reset", "limit"]);

export function publicAllows(action) {
  return PUBLIC_ACTIONS.includes(action);
}

/**
 * One shared sliding-window limit for all public demo requests (the simulator is one loan everyone sees).
 * Returns a function: call it with the current time; it says true while under `max` hits in `windowMs`.
 */
export function makeRateLimiter(max, windowMs) {
  const hits = [];
  return (now = Date.now()) => {
    while (hits.length && now - hits[0] >= windowMs) hits.shift();
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
}
