// QuickNode Streams filter for Airbag.
//   Network:     Arc Testnet
//   Dataset:     Block with Receipts
//   Destination: Webhook -> https://<your server>/api/stream?key=<WEBHOOK_SECRET>
// Paste this whole file into the Stream's filter editor. Edit the three constants first.
//
// It keeps only what matters to the loan and returns null otherwise (null = nothing is sent):
//   - every event of the cirBTC/USDC lending market (matched by its market id, topic 1 of Morpho's
//     Borrow / Repay / SupplyCollateral / WithdrawCollateral / Liquidate events), so the bot also
//     hears about other people's borrows and liquidations in its market
//   - every transaction sent from or to the bot wallet, and every log that names it in a topic
//   - deposits and withdrawals in the savings vault that belong to the bot wallet
// The server answers each delivery by waking the bot, which re-reads the loan right away.

var BOT_WALLET = "0xF6B5177872Fc12DCBcE76d023e96988fB7Fa3F0C";                         // the Airbag bot wallet
var MARKET_ID = "0xf8a71f6df9dc7725d1c2fd848e4635d1e9ddca11da4e2dc2f9801005bd2b5d58";   // Borrow Kit cirBTC/USDC market (Morpho id)
var SAVINGS_VAULT = "0xaabbef1d3971c710276ed41ec791bbe14cdb8e88";                       // Earn Kit USDC vault

var MORPHO = {
  "0x570954540bed6b1304a87dfe815a5eda4a648f7097a16240dcd85c9b5fd42a43": "borrow",
  "0x52acb05cebbd3cd39715469f22afbf5a17496295ef3bc9bb5944056c63ccaa09": "repay",
  "0xa3b9472a1399e17e123f3c2e6586c23e504184d504de59cdaa2b375e880c6184": "collateral in",
  "0xe80ebd7cc9223d7382aab2e0d1d6155c65651f83d53c8b9b06901d167e321142": "collateral out",
  "0xa4946ede45d0c6f06a0f5ce92c9ad3b4751452d2fe0e25010783bcab57a67e41": "liquidation",
  "0xedf8870433c83823eb071d3df1caa8d008f12f6440918c20d75a3602cda30fe0": "lender supply",
  "0xa56fc0ad5702ec05ce63666221f796fb62437c32db1aa1aa075fc6484cf58fbf": "lender withdraw"
};
var VAULT = {
  "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7": "savings deposit",
  "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db": "savings withdraw"
};

function lower(x) { return typeof x === "string" ? x.toLowerCase() : ""; }
function toNumber(x) { return typeof x === "string" && x.indexOf("0x") === 0 ? parseInt(x, 16) : (x == null ? null : Number(x)); }

function main(stream) {
  var wallet = lower(BOT_WALLET), walletTopic = "0x000000000000000000000000" + wallet.slice(2);
  var market = lower(MARKET_ID), vault = lower(SAVINGS_VAULT);
  var items = stream && stream.data != null ? stream.data : stream;
  if (!Array.isArray(items)) items = [items];
  var matches = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var receipts = item.receipts || (Array.isArray(item) ? item : []);
    var blockNumber = toNumber(item.block && item.block.number);

    for (var j = 0; j < receipts.length; j++) {
      var r = receipts[j] || {};
      var tx = r.transactionHash || null;
      var block = blockNumber != null ? blockNumber : toNumber(r.blockNumber);
      var mine = lower(r.from) === wallet || lower(r.to) === wallet;
      var found = false;
      var logs = r.logs || [];

      for (var k = 0; k < logs.length; k++) {
        var log = logs[k] || {};
        var topics = (log.topics || []).map(lower);
        var t0 = topics[0];
        var namesWallet = topics.indexOf(walletTopic) > 0;

        if (MORPHO[t0] && topics[1] === market) {
          var kind = MORPHO[t0];
          var ours = namesWallet;
          if (kind === "liquidation" && ours) kind = "OUR LOAN LIQUIDATED";
          matches.push({ block: block, tx: tx, kind: (ours ? "our loan: " : "market: ") + kind, detail: "Morpho " + lower(log.address).slice(0, 10), address: lower(log.address) });
          found = true;
        } else if (VAULT[t0] && lower(log.address) === vault && namesWallet) {
          matches.push({ block: block, tx: tx, kind: VAULT[t0], detail: "Earn vault", address: vault });
          found = true;
        }
      }
      if (mine && !found) matches.push({ block: block, tx: tx, kind: "bot wallet transaction", detail: lower(r.from) === wallet ? "sent by the bot" : "sent to the bot", address: lower(r.to) });
    }
  }
  return matches.length ? { matches: matches } : null;
}
