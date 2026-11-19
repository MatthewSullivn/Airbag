// The check of the protected loans is started by a timer and by QuickNode Stream deliveries. These tests pin down
// what must hold whoever starts it: never two checks at once, and a wake-up during a check is not lost.
import test from "node:test";
import assert from "node:assert/strict";
import { oneAtATime } from "../src/one-at-a-time.mjs";

/** A job we can finish by hand, which records how many copies of it ran together. */
function slowJob() {
  const state = { started: 0, together: 0, most: 0, finish: [] };
  const job = () => new Promise((resolve) => {
    state.started++;
    state.together++;
    state.most = Math.max(state.most, state.together);
    state.finish.push(() => { state.together--; resolve(); });
  });
  return { state, job };
}
const settle = () => new Promise((r) => setImmediate(r));

test("a timer tick during a check is skipped, not queued", async () => {
  const { state, job } = slowJob();
  const run = oneAtATime(job);
  const first = run();
  await run();                     // the tick: returns at once, starts nothing
  await run();
  assert.equal(state.started, 1);
  state.finish.shift()();
  await first;
  await settle();
  assert.equal(state.started, 1, "nothing ran after the check ended");
});

test("a wake-up during a check is kept: one more check follows it", async () => {
  const { state, job } = slowJob();
  const run = oneAtATime(job);
  const first = run();
  await run(true);                 // a Stream delivery arrives while the check reads the chain
  assert.equal(state.started, 1, "it does not start a second check next to the first");
  state.finish.shift()();
  await first;
  await settle();
  assert.equal(state.started, 2, "the follow-up check ran");
  assert.equal(state.most, 1, "never two checks at once");
  state.finish.shift()();
  await settle();
  assert.equal(state.started, 2, "and only one follow-up");
});

test("many wake-ups during one check still mean one follow-up", async () => {
  const { state, job } = slowJob();
  const run = oneAtATime(job);
  const first = run(true);
  for (let i = 0; i < 5; i++) await run(true);
  state.finish.shift()();
  await first;
  await settle();
  state.finish.shift()();
  await settle();
  assert.equal(state.started, 2);
  assert.equal(state.most, 1);
});

test("a wake-up with nothing running starts a check right away", async () => {
  const { state, job } = slowJob();
  const run = oneAtATime(job);
  const p = run(true);
  assert.equal(state.started, 1);
  state.finish.shift()();
  await p;
});

test("a check that fails does not block the next one, and a kept wake-up still follows", async () => {
  let calls = 0;
  let release;
  const run = oneAtATime(() => {
    calls++;
    if (calls === 1) return new Promise((_, reject) => { release = () => reject(new Error("Arc did not answer")); });
    return Promise.resolve();
  });
  const first = run();
  await run(true);
  release();
  await assert.rejects(first, /Arc did not answer/);
  await settle();
  assert.equal(calls, 2, "the kept wake-up ran after the failure");
  await run();
  assert.equal(calls, 3, "and later checks run as usual");
});
