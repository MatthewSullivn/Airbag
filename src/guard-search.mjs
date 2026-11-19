// Finding the guards made for our bot key, straight from Arc. Pure logic: the caller passes in the function
// that asks the chain for logs, so this can be tested without a network.
//
// Every AirbagGuard announces its bot key in a BotChanged(address) event when it is created. The server used to
// find those events only through Arc's block explorer. On the hosted server that search found nothing for 13
// minutes after a restart (Nov 19, 2026), so connected wallets were left unwatched until their owner opened
// the page. The chain itself is what the bot can always reach, so the search now asks it directly.
//
// Arc's public RPC refuses a log search over more than a few thousand blocks ("requested range too large":
// 10,000 is refused, 5,000 is answered), so the search goes in ranges and remembers how far it got.
// It also refuses a quick run of searches ("Request exceeds defined limit": seen after 20 in 7 seconds, four at
// a time), so the caller asks for one range at a time, a few per pass, with a short pause between them.

/** The most blocks one eth_getLogs call may cover on Arc's public RPC, with room to spare. */
export const MAX_BLOCKS_PER_SEARCH = 5000;

/**
 * [from, to] cut into pieces of at most `size` blocks, oldest first. Both ends are included.
 * @param {number} from @param {number} to @param {number} [size]
 * @returns {[number, number][]}
 */
export function blockRanges(from, to, size = MAX_BLOCKS_PER_SEARCH) {
  const out = [];
  if (!Number.isInteger(from) || !Number.isInteger(to) || !Number.isInteger(size) || size < 1) return out;
  for (let a = from; a <= to; a += size) out.push([a, Math.min(a + size - 1, to)]);
  return out;
}

/** The address in a BotChanged event's data (one 32-byte word), lower case. null when the data is not one address. */
export function botIn(data) {
  if (typeof data !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(data)) return null;
  if (!/^0x0{24}/.test(data)) return null;
  return "0x" + data.slice(-40).toLowerCase();
}

/**
 * Search [from, to] for BotChanged events.
 *   getLogs(a, b)  asks the chain for the BotChanged logs of blocks a..b: [{ address, data, blockNumber }]
 *   together       how many ranges to ask for at once
 *   maxRanges      stop after this many ranges, so one pass never takes long. The next pass carries on.
 *   pause          milliseconds to wait between two batches, to stay under the RPC's rate limit
 * Returns what was found and the last block that was really searched. A range that fails stops the pass there:
 * `scannedTo` then names the block before it, so nothing is skipped and the next pass tries that range again.
 * `scannedTo` is from - 1 when not even the first range was answered.
 * @returns {Promise<{ found: { guard: string, bot: string, block: number | null }[], scannedTo: number, error: string | null }>}
 */
export async function searchBotChanged({ getLogs, from, to, size = MAX_BLOCKS_PER_SEARCH, together = 1, maxRanges = 10, pause = 0 }) {
  const ranges = blockRanges(from, to, size).slice(0, Math.max(1, maxRanges));
  const found = [];
  let scannedTo = from - 1, error = null;
  for (let i = 0; i < ranges.length && !error; i += together) {
    if (i > 0 && pause > 0) await new Promise((r) => setTimeout(r, pause));
    const batch = ranges.slice(i, i + together);
    const answers = await Promise.allSettled(batch.map(([a, b]) => getLogs(a, b)));
    for (let k = 0; k < batch.length; k++) {
      const answer = answers[k];
      if (answer.status !== "fulfilled" || !Array.isArray(answer.value)) {
        error = String(answer.status === "rejected" ? answer.reason?.shortMessage ?? answer.reason?.message ?? answer.reason : "not a list of logs").split("\n")[0].slice(0, 200);
        break;                                    // later ranges of this batch are not counted: no gaps
      }
      for (const log of answer.value) {
        const bot = botIn(log?.data);
        const guard = typeof log?.address === "string" ? log.address.toLowerCase() : null;
        if (!bot || !guard || !/^0x[0-9a-f]{40}$/.test(guard)) continue;
        const n = typeof log.blockNumber === "string" ? parseInt(log.blockNumber, 16) : Number(log.blockNumber);
        found.push({ guard, bot, block: Number.isFinite(n) ? n : null });
      }
      scannedTo = batch[k][1];
    }
  }
  return { found, scannedTo, error };
}
