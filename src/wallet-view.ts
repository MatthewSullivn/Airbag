// Read-only view of ANY wallet on Arc Testnet, for the dashboard's "Connect wallet":
// its USDC and cirBTC, its savings in the Earn vault, its loan in the cirBTC/USDC market,
// and the odds for that loan's line. No keys and no transactions: only public reads.
import { createPublicClient, erc20Abi, formatUnits, http, parseAbi, type Address } from "viem";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET_MARKET, ARC_TESTNET_VAULT, CIRBTC, USDC, type Config } from "./config.js";
import { health as healthOf, liqPrice } from "./brain.mjs";
import { debtFromShares, isAddress } from "./wallet-math.mjs";
import type { GeminiOdds, OddsDetail } from "./gemini.js";

const MORPHO_ABI = parseAbi([
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
]);
const ORACLE_ABI = parseAbi(["function price() view returns (uint256)"]);
const VAULT_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

export interface WalletLoan {
  debt: number;                 // USDC owed
  collateral: number;           // cirBTC posted
  line: number;                 // BTC price where the loan is liquidated
  health: number;               // at priceUsed
  priceUsed: number;
  priceSource: "real" | "oracle";
  odds: OddsDetail | null;      // null = Gemini has nothing to say right now
  oddsBy: string | null;        // expiry of the ladder the odds come from
}
export interface WalletView {
  address: string;
  usdc: number;
  cirbtc: number;
  savings: number;              // USDC in the Earn vault
  loan: WalletLoan | null;      // null = no loan in this market
  /** The lending market's numbers, needed to size a new loan even when the wallet has none yet. */
  market: { lltv: number; oraclePrice: number; priceUsed: number; priceSource: "real" | "oracle" };
  at: number;
}

const CACHE_MS = 5_000;

/** The market and vault to read: the running bot's when it knows them (live mode), else Arc Testnet's defaults. */
export function resolveIds(ids: { marketId: string | null; vault: string | null }) {
  return {
    marketId: (/^0x[0-9a-fA-F]{64}$/.test(ids.marketId ?? "") ? ids.marketId : ARC_TESTNET_MARKET) as `0x${string}`,
    vault: (isAddress(ids.vault) ? ids.vault : ARC_TESTNET_VAULT) as Address,
  };
}

/** Returns a function that reads one wallet. `ids` come from the running bot when it knows them (live mode). */
export function makeWalletReader(cfg: Config, gemini: GeminiOdds, ids: { marketId: string | null; vault: string | null }) {
  const client = createPublicClient({ chain: arcTestnet, transport: http(cfg.rpcUrl) });
  const morpho = cfg.morphoAddress as Address;
  const { marketId, vault } = resolveIds(ids);
  let market: { oracle: Address; lltv: number } | null = null;
  const cache = new Map<string, WalletView>();

  return async function readWalletView(address: string, opts: { fresh?: boolean } = {}): Promise<WalletView> {
    const key = address.toLowerCase();
    const hit = cache.get(key);
    if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit;
    const a = address as Address;
    if (!market) {
      const mp = await client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] });
      market = { oracle: mp[2], lltv: Number(formatUnits(mp[4], 18)) };
    }
    const [usdc, btc, pos, mkt, price, shares, spot, odds] = await Promise.all([
      client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [a] }),
      client.readContract({ address: CIRBTC, abi: erc20Abi, functionName: "balanceOf", args: [a] }),
      client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "position", args: [marketId, a] }),
      client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "market", args: [marketId] }),
      client.readContract({ address: market.oracle, abi: ORACLE_ABI, functionName: "price" }),
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "balanceOf", args: [a] }),
      gemini.spot(),
      gemini.get(),
    ]);
    const savingsRaw = shares === 0n ? 0n : await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "convertToAssets", args: [shares] });

    const debt = Number(formatUnits(debtFromShares(pos[1], mkt[2], mkt[3]), 6));
    const collateral = Number(formatUnits(pos[2], 8));
    const oraclePrice = Number(price) / 1e34;   // Morpho oracle scale: 1e36 * 10^(6 - 8)
    const useReal = cfg.priceSource === "real" && spot.price != null;
    const priceUsed = useReal ? spot.price! : oraclePrice;
    let loan: WalletLoan | null = null;
    if (debt > 0 && collateral > 0) {
      const line = liqPrice(debt, collateral, market.lltv);
      const detail = odds.events.length ? odds.detail(line) : null;
      loan = {
        debt,
        collateral,
        line,
        health: healthOf(debt, collateral, priceUsed, market.lltv),
        priceUsed,
        priceSource: useReal ? "real" : "oracle",
        odds: detail,
        oddsBy: detail ? odds.events.find((e) => e.ticker === detail.ticker)?.expiryDate ?? null : null,
      };
    }
    const view: WalletView = {
      address,
      usdc: Number(formatUnits(usdc, 6)),
      cirbtc: Number(formatUnits(btc, 8)),
      savings: Number(formatUnits(savingsRaw, 6)),
      loan,
      market: { lltv: market.lltv, oraclePrice, priceUsed, priceSource: useReal ? "real" : "oracle" },
      at: Date.now(),
    };
    cache.set(key, view);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return view;
  };
}
