// Read-only: list the Borrow Kit markets and Earn Kit vaults on Arc Testnet.
// No wallet needed.   npm run explore
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();

const { markets } = await kit.borrow.exploreMarkets({ chain: "Arc_Testnet", sortBy: "borrowApy" });
console.log(`\n=== Borrow Kit markets on Arc Testnet: ${markets.length}`);
console.dir(markets, { depth: null });

const { vaults, pagination } = await kit.earn.exploreVaults({ chain: "Arc_Testnet", sortBy: "apy" });
console.log(`\n=== Earn Kit vaults on Arc Testnet: ${pagination?.totalCount ?? vaults.length}`);
console.dir(vaults, { depth: null });
