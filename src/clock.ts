// Laptop clocks drift. Circle's Borrow Kit signs each write with a deadline about two minutes
// out and checks it against Date.now(), so a clock a few minutes fast makes every write fail with
// "execution deadline has expired" (this happened on our demo laptop: +157 s).
// At startup we compare the local clock with Arc's latest block time. If they differ by more than
// 15 s, Date.now() is shifted for this process only (the system clock is left alone) and we say so.
import { createPublicClient, http } from "viem";
import { arcTestnet } from "viem/chains";

let appliedMs = 0;

export async function syncClockToArc(rpcUrl: string): Promise<number> {
  if (appliedMs !== 0) return appliedMs;
  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
    const block = await client.getBlock();
    const skew = Date.now() - Number(block.timestamp) * 1000;   // positive = local clock is fast
    if (Math.abs(skew) > 15_000) {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() - skew;
      appliedMs = skew;
      console.warn(`[clock] this computer's clock is ${(skew / 1000).toFixed(0)} s ${skew > 0 ? "fast" : "slow"} compared with Arc; correcting it for Airbag. Syncing the system clock fixes this for good.`);
    }
  } catch (e) {
    console.warn(`[clock] could not compare the clock with Arc: ${(e as Error).message}`);
  }
  return appliedMs;
}

export const clockSkewMs = () => appliedMs;
