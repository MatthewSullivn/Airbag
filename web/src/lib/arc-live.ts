// Arc Testnet's newest block, read by the page itself straight from Arc's public RPC every two seconds.
// Read-only and keyless: one eth_getBlockByNumber("latest"). It only shows that the chain is alive and how far
// it has got; every number about the loan still comes from the server's own reads of Morpho and the vault.
import { useEffect, useState } from "react";

const RPC = "https://rpc.testnet.arc.io";

export interface ArcBlock {
  number: number;
  /** The block's own time, in ms. */
  time: number;
  /** Transactions in it. */
  txs: number;
}

export function useArcBlock(on = true, everyMs = 2000): ArcBlock | null {
  const [block, setBlock] = useState<ArcBlock | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        // a hidden tab does not need to ask
        if (!document.hidden) {
          const res = await fetch(RPC, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }),
            signal: AbortSignal.timeout(5000),
          });
          const b = ((await res.json()) as { result?: { number?: string; timestamp?: string; transactions?: unknown[] } }).result;
          const number = parseInt(b?.number ?? "", 16), time = parseInt(b?.timestamp ?? "", 16) * 1000;
          if (alive && Number.isFinite(number) && Number.isFinite(time)) setBlock((prev) => (prev && prev.number >= number ? prev : { number, time, txs: b?.transactions?.length ?? 0 }));
        }
      } catch {
        /* Arc's RPC did not answer: keep the last block, try again */
      } finally {
        if (alive) timer = setTimeout(tick, everyMs);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [on, everyMs]);
  return block;
}
