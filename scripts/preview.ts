// Read-only: how much can a faucet-sized amount of cirBTC borrow, and what price does
// the testnet lending market use for cirBTC?   npm run preview [-- 0.0002]
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();
const chain = "Arc_Testnet" as const;
const collateralAmount = process.argv[2] ?? "0.0001";

const { markets } = await kit.borrow.exploreMarkets({ chain });
const market = markets.find((m) => m.collateralAsset.symbol === "cirBTC" && m.loanAsset.symbol === "USDC");
if (!market) throw new Error("No cirBTC/USDC market found on Arc Testnet");
console.log(`market ${market.marketId}  lltv ${market.lltv}`);

const max = await kit.borrow.getMaxBorrow({ chain, marketId: market.marketId, collateralAmount });
const hf = max.resultingHealthFactor;
const liq = max.liquidationPrice ? Number(max.liquidationPrice.amount) : null;
console.log(`\n${collateralAmount} cirBTC can borrow at most ${max.maxBorrowAmount.amount} USDC`);
console.log(`  health at max borrow: ${hf}   liquidation price: ${liq}`);
if (hf && liq) console.log(`  => the market prices cirBTC at about $${(hf * liq).toFixed(2)} (health x liquidation price)`);

for (const target of [1.5, 1.25, 1.1]) {
  try {
    const q = await kit.borrow.getRequiredCollateral({ chain, marketId: market.marketId, borrowAmount: "2", targetHealthFactor: target });
    console.log(`  borrow 2 USDC at health ${target}: needs ${q.requiredCollateral.amount} cirBTC (line $${q.liquidationPrice?.amount})`);
  } catch (e) {
    console.log(`  borrow 2 USDC at health ${target}: ${(e as Error).message}`);
  }
}
