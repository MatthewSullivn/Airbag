// Checks a QuickNode Stream delivery against the real transaction receipt on Arc.
// This lets /api/stream accept deliveries without a secret in its URL: the server never trusts
// what the caller says, it fetches each transaction itself and keeps only the ones that really
// touch our lending market or our wallet. The label shown on the dashboard is computed here too,
// so a caller can't make a harmless transaction look like a liquidation.

const MORPHO = {
  "0x570954540bed6b1304a87dfe815a5eda4a648f7097a16240dcd85c9b5fd42a43": "borrow",
  "0x52acb05cebbd3cd39715469f22afbf5a17496295ef3bc9bb5944056c63ccaa09": "repay",
  "0xa3b9472a1399e17e123f3c2e6586c23e504184d504de59cdaa2b375e880c6184": "collateral in",
  "0xe80ebd7cc9223d7382aab2e0d1d6155c65651f83d53c8b9b06901d167e321142": "collateral out",
  "0xa4946ede45d0c6f06a0f5ce92c9ad3b4751452d2fe0e25010783bcab57a67e41": "liquidation",
  "0xedf8870433c83823eb071d3df1caa8d008f12f6440918c20d75a3602cda30fe0": "lender supply",
  "0xa56fc0ad5702ec05ce63666221f796fb62437c32db1aa1aa075fc6484cf58fbf": "lender withdraw",
};
const lower = (x) => (typeof x === "string" ? x.toLowerCase() : "");

/** A transaction hash as QuickNode sends it: 0x + 64 hex. */
export const isTxHash = (x) => typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x);

/**
 * What a receipt means for us, or null when it has nothing to do with our market or wallet.
 * receipt = { from, to, logs: [{ address, topics }] } (viem or raw JSON-RPC shape)
 */
export function describeReceipt(receipt, { wallet, marketId }) {
  if (!receipt) return null;
  const w = lower(wallet), walletTopic = "0x000000000000000000000000" + w.slice(2), m = lower(marketId);
  for (const log of receipt.logs || []) {
    const t = (log.topics || []).map(lower);
    const name = MORPHO[t[0]];
    if (name && t[1] === m) {
      const ours = t.indexOf(walletTopic) > 0;
      const kind = ours ? (name === "liquidation" ? "our loan: OUR LOAN LIQUIDATED" : `our loan: ${name}`) : `market: ${name}`;
      return { kind, detail: `Morpho ${lower(log.address).slice(0, 10)}` };
    }
  }
  if (lower(receipt.from) === w || lower(receipt.to) === w)
    return { kind: "bot wallet transaction", detail: lower(receipt.from) === w ? "sent by the bot" : "sent to the bot" };
  return null;
}
