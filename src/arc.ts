// Everything that touches Arc: the loan (Circle Borrow Kit), the savings pot (Circle Earn Kit)
// and the wallet's balances. Two implementations of one interface:
//   LiveArc - real transactions on Arc Testnet through Circle's App Kit, signed by the bot's key
//   SimArc  - the same behaviour in memory, for building the dashboard and as a demo backup
import { randomBytes } from "node:crypto";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2/next";   // the /next build batches through Arc's sender-preserving batcher (needed by Borrow Kit for a plain wallet)
import { createPublicClient, erc20Abi, formatUnits, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { CIRBTC, USDC, type Config } from "./config.js";
import { syncClockToArc } from "./clock.js";

export interface TxRef { label: string; hash: string; url: string }

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

export interface LoanView {
  loanId: string;
  marketId: string;
  status: "active" | "closed";
  /** Borrow Kit reports PENDING for a few seconds after every change; numbers are null meanwhile. */
  dataStatus: "READY" | "PENDING";
  debt: number | null;               // USDC owed, interest included
  collateral: number | null;         // cirBTC posted
  accruedInterest: number | null;
  borrowApy: number | null;
  /** Borrow Kit's own health numbers, computed at the lending market's (oracle) price. */
  healthFactor: number | null;
  band: string | null;
  ltv: number | null;
  liquidationPrice: number | null;
  /** cirBTC price the lending market uses = healthFactor x liquidationPrice. */
  oraclePrice: number | null;
}
export interface SavingsView { vaultAddress: string; vaultName: string; balance: number; apy: number | null }
export interface WalletView { address: string; usdc: number; cirbtc: number }
export interface Move { amount: number; txs: TxRef[] }

export interface ArcBackend {
  readonly mode: "live" | "sim";
  readonly address: string;
  marketId: string | null;
  lltv: number;
  vault: { address: string; name: string; apy: number | null } | null;
  loanId: string | null;
  init(): Promise<void>;
  readLoan(): Promise<LoanView | null>;
  readSavings(): Promise<SavingsView | null>;
  readWallet(): Promise<WalletView>;
  /** The save: take `amount` USDC out of savings and repay the loan with it. */
  moveSavingsIntoLoan(amount: number): Promise<Move>;
  /** The give-back: borrow `amount` back out of the loan and put it into savings. */
  giveBack(amount: number): Promise<Move>;
  /** Demo: borrow more; the USDC stays in the wallet (as if spent). */
  borrowMore(amount: number): Promise<Move>;
  /** Demo reset: repay from the wallet's own USDC (not from savings). */
  repayFromWallet(amount: number): Promise<Move>;
  /** Deposit wallet USDC into savings (setup / top-up). */
  depositToSavings(amount: number): Promise<Move>;
  /** Most USDC the Borrow Kit will lend in total against the loan's current collateral. */
  maxDebt(): Promise<number | null>;
  registerWebhook(url: string | null): Promise<string>;
}

/** Human-readable USDC string with at most 6 decimals, rounded down (Circle rejects more). */
export const usdc6 = (x: number): string => (Math.floor(x * 1e6 + 1e-6) / 1e6).toFixed(6);
const n = (v: { amount: string } | null | undefined): number | null => (v ? Number(v.amount) : null);

// ------------------------------------------------------------------------------------------------
export class LiveArc implements ArcBackend {
  readonly mode = "live" as const;
  readonly address: string;
  marketId: string | null;
  lltv = 0.86;
  vault: { address: string; name: string; apy: number | null } | null = null;
  loanId: string | null;
  private kit = new AppKit();
  private adapter: ReturnType<typeof createViemAdapterFromPrivateKey>;
  private client;

  constructor(private cfg: Config) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(cfg.privateKey)) throw new Error("PRIVATE_KEY missing or malformed in .env (run: npm run wallet:new)");
    this.address = privateKeyToAccount(cfg.privateKey as `0x${string}`).address;
    this.adapter = createViemAdapterFromPrivateKey({ privateKey: cfg.privateKey });
    this.client = createPublicClient({ chain: arcTestnet, transport: http(cfg.rpcUrl) });
    this.marketId = cfg.marketId || null;
    this.loanId = cfg.loanId || null;
  }

  private get from() {
    return { adapter: this.adapter, chain: this.cfg.chain };
  }
  private tx(label: string, hash: string | undefined | null): TxRef[] {
    return hash ? [{ label, hash, url: `${this.cfg.explorer}/tx/${hash}` }] : [];
  }
  /** Borrow Kit results are confirmed / confirmed-details-unavailable / submitted. */
  private txOf(label: string, r: any): TxRef[] {
    if (r?.status === "submitted") throw new Error(`${label}: submitted but not confirmed yet (batch ${r.batchId})`);
    return this.tx(label, r?.txHash);
  }

  async init() {
    await syncClockToArc(this.cfg.rpcUrl);   // Borrow Kit deadlines are checked against Date.now()
    const { markets } = await this.kit.borrow.exploreMarkets({ chain: this.cfg.chain });
    const market = this.marketId
      ? markets.find((m) => m.marketId.toLowerCase() === this.marketId!.toLowerCase())
      : markets.find((m) => m.collateralAsset.symbol === "cirBTC" && m.loanAsset.symbol === "USDC");
    if (!market) throw new Error("cirBTC/USDC Borrow Kit market not found on Arc Testnet");
    this.marketId = market.marketId;
    this.lltv = market.lltv ?? 0.86;

    const { vaults } = await this.kit.earn.exploreVaults({ chain: this.cfg.chain, sortBy: "apy" });
    const v = this.cfg.vaultAddress
      ? vaults.find((x: any) => x.vaultAddress.toLowerCase() === this.cfg.vaultAddress.toLowerCase())
      : vaults.find((x: any) => x.asset === "USDC" && x.status === "active");
    if (v) this.vault = { address: v.vaultAddress, name: v.name, apy: v.currentApy ?? null };
    else if (this.cfg.vaultAddress) this.vault = { address: this.cfg.vaultAddress, name: "USDC vault", apy: null };

    if (!this.loanId) await this.findLoan();
  }

  private async findLoan() {
    const { loans } = await this.kit.borrow.getLoans({ walletAddress: this.address, chain: this.cfg.chain });
    const open = loans.find((l: any) => l.status === "active" && l.marketId.toLowerCase() === this.marketId?.toLowerCase());
    this.loanId = open?.loanId ?? null;
  }

  /**
   * The loan as the bot sees it. Read straight from the Morpho contract when its address is known:
   * on Nov 17 2026 Borrow Kit's getPosition still returned the old debt as READY right after a
   * repay, which could make the bot repay twice. The chain is immediate. Borrow Kit is the fallback.
   */
  async readLoan(): Promise<LoanView | null> {
    if (!this.loanId) await this.findLoan();
    if (!this.loanId) return null;
    if (this.cfg.morphoAddress) {
      try {
        return await this.readLoanOnChain();
      } catch (e) {
        console.warn(`[arc] on-chain loan read failed, using Borrow Kit: ${(e as Error).message}`);
      }
    }
    return this.readLoanFromKit();
  }

  private oracle: Address | null = null;
  private apy: { value: number | null; at: number } = { value: null, at: 0 };

  private async readLoanOnChain(): Promise<LoanView> {
    const morpho = this.cfg.morphoAddress as Address;
    const id = this.marketId as `0x${string}`;
    if (!this.oracle) {
      const mp = await this.client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "idToMarketParams", args: [id] });
      this.oracle = mp[2];
      this.lltv = Number(formatUnits(mp[4], 18));
    }
    const [p, m, price] = await Promise.all([
      this.client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "position", args: [id, this.address as Address] }),
      this.client.readContract({ address: morpho, abi: MORPHO_ABI, functionName: "market", args: [id] }),
      this.client.readContract({ address: this.oracle, abi: ORACLE_ABI, functionName: "price" }),
    ]);
    // Morpho Blue share math (virtual shares 1e6, virtual assets 1), rounded up like Morpho does for debt.
    // Interest accrued since the market's last update is not included (0.025% a year on testnet).
    const shares = p[1], totalAssets = m[2] + 1n, totalShares = m[3] + 1_000_000n;
    const debtRaw = shares === 0n ? 0n : (shares * totalAssets + totalShares - 1n) / totalShares;
    const debt = Number(formatUnits(debtRaw, 6));
    const collateral = Number(formatUnits(p[2], 8));
    const oraclePrice = Number(price) / 1e34;          // Morpho oracle scale: 1e36 * 10^(6 - 8)
    const hf = debt > 0 && collateral > 0 ? (collateral * oraclePrice * this.lltv) / debt : null;
    if (Date.now() - this.apy.at > 60_000) {
      this.apy.at = Date.now();
      this.kit.borrow.getPosition({ loanId: this.loanId! }).then((x) => (this.apy.value = x.borrowApy ?? this.apy.value)).catch(() => {});
    }
    return {
      loanId: this.loanId!,
      marketId: this.marketId!,
      status: debt > 0 || collateral > 0 ? "active" : "closed",
      dataStatus: "READY",
      debt,
      collateral,
      accruedInterest: null,
      borrowApy: this.apy.value,
      healthFactor: hf,
      band: hf == null ? null : hf >= 1.2 ? "SAFE" : hf >= 1.1 ? "WARN" : hf >= 1.05 ? "URGENT" : hf >= 1 ? "IMMINENT" : "LIQUIDATABLE",
      ltv: debt > 0 && collateral > 0 ? debt / (collateral * oraclePrice) : null,
      liquidationPrice: debt > 0 && collateral > 0 ? debt / (collateral * this.lltv) : null,
      oraclePrice,
    };
  }

  private async readLoanFromKit(): Promise<LoanView | null> {
    const p = await this.kit.borrow.getPosition({ loanId: this.loanId! });
    const hf = p.healthFactor ?? null;
    const liq = n(p.liquidationPrice);
    return {
      loanId: p.loanId,
      marketId: p.marketId,
      status: p.status,
      dataStatus: p.dataStatus,
      debt: n(p.borrowed),
      collateral: n(p.collateral),
      accruedInterest: n(p.accruedInterest),
      borrowApy: p.borrowApy ?? null,
      healthFactor: hf,
      band: p.healthFactorBand ?? null,
      ltv: p.ltv ?? null,
      liquidationPrice: liq,
      oraclePrice: hf != null && liq != null ? hf * liq : null,
    };
  }

  async readSavings(): Promise<SavingsView | null> {
    if (!this.vault) return null;
    // The vault itself (ERC-4626) is immediate; Earn Kit's position lagged a few seconds after a deposit.
    try {
      const v = this.vault.address as Address;
      const shares = await this.client.readContract({ address: v, abi: VAULT_ABI, functionName: "balanceOf", args: [this.address as Address] });
      const assets = shares === 0n ? 0n : await this.client.readContract({ address: v, abi: VAULT_ABI, functionName: "convertToAssets", args: [shares] });
      return { vaultAddress: this.vault.address, vaultName: this.vault.name, balance: Number(formatUnits(assets, 6)), apy: this.vault.apy };
    } catch (e) {
      console.warn(`[arc] on-chain savings read failed, using Earn Kit: ${(e as Error).message}`);
    }
    try {
      const pos = await this.kit.earn.getPosition({ from: this.from, vaultAddress: this.vault.address });
      return { vaultAddress: this.vault.address, vaultName: this.vault.name, balance: Number(pos.currentBalance), apy: pos.currentApy ?? this.vault.apy };
    } catch (e) {
      // no position yet reads as an error on some versions; treat as an empty pot
      if (/not found|no position|404/i.test((e as Error).message)) return { vaultAddress: this.vault.address, vaultName: this.vault.name, balance: 0, apy: this.vault.apy };
      throw e;
    }
  }

  async readWallet(): Promise<WalletView> {
    const [u, b] = await Promise.all([
      this.client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [this.address as Address] }),
      this.client.readContract({ address: CIRBTC, abi: erc20Abi, functionName: "balanceOf", args: [this.address as Address] }),
    ]);
    return { address: this.address, usdc: Number(formatUnits(u, 6)), cirbtc: Number(formatUnits(b, 8)) };
  }

  private needLoan(): string {
    if (!this.loanId) throw new Error("no open loan for this wallet yet (run: npm run loan:open)");
    return this.loanId;
  }
  private needVault(): string {
    if (!this.vault) throw new Error("no USDC Earn vault configured");
    return this.vault.address;
  }

  async moveSavingsIntoLoan(amount: number): Promise<Move> {
    const loanId = this.needLoan();
    const vaultAddress = this.needVault();
    const w = await this.kit.earn.withdraw({ from: this.from, vaultAddress, amount: usdc6(amount) });
    const got = Math.min(amount, Number(w.amount) || amount);
    const txs: TxRef[] = this.tx("withdraw from savings", w.txHash);
    try {
      const r = await this.kit.borrow.repay({ from: this.from, loanId, repayAmount: usdc6(got) });
      txs.push(...this.txOf("repay loan", r));
      return { amount: got, txs };
    } catch (e) {
      // put the money back in the pot rather than leave it loose in the wallet
      try {
        const d = await this.kit.earn.deposit({ from: this.from, vaultAddress, amount: usdc6(got) });
        txs.push(...this.tx("re-deposit after failed repay", d.txHash));
      } catch { /* the next tick will see the money in the wallet */ }
      (e as any).txs = txs;
      throw e;
    }
  }

  async giveBack(amount: number): Promise<Move> {
    const loanId = this.needLoan();
    const vaultAddress = this.needVault();
    const b = await this.kit.borrow.borrow({ from: this.from, loanId, borrowAmount: usdc6(amount) });
    const txs = this.txOf("borrow back", b);
    const d = await this.kit.earn.deposit({ from: this.from, vaultAddress, amount: usdc6(amount) });
    txs.push(...this.tx("deposit into savings", d.txHash));
    return { amount, txs };
  }

  async borrowMore(amount: number): Promise<Move> {
    const r = await this.kit.borrow.borrow({ from: this.from, loanId: this.needLoan(), borrowAmount: usdc6(amount) });
    return { amount, txs: this.txOf("borrow more", r) };
  }

  async repayFromWallet(amount: number): Promise<Move> {
    const r = await this.kit.borrow.repay({ from: this.from, loanId: this.needLoan(), repayAmount: usdc6(amount) });
    return { amount, txs: this.txOf("repay from wallet", r) };
  }

  async depositToSavings(amount: number): Promise<Move> {
    const d = await this.kit.earn.deposit({ from: this.from, vaultAddress: this.needVault(), amount: usdc6(amount) });
    return { amount, txs: this.tx("deposit into savings", d.txHash) };
  }

  async maxDebt(): Promise<number | null> {
    const loan = await this.readLoan();
    if (!loan?.collateral || !this.marketId) return null;
    const q = await this.kit.borrow.getMaxBorrow({ chain: this.cfg.chain, marketId: this.marketId, collateralAmount: String(loan.collateral) });
    return Number(q.maxBorrowAmount.amount);
  }

  async registerWebhook(url: string | null): Promise<string> {
    const r = await this.kit.borrow.registerWebhook({ from: this.from, loanId: this.needLoan(), ...(url ? { webhookUrl: url } : {}) });
    return r.webhookUrl ?? "(removed)";
  }
}

// ------------------------------------------------------------------------------------------------
// In-memory twin of Arc Testnet as measured on Nov 17 2026: the lending market prices cirBTC at a
// fixed $75,000, LLTV 0.86, Borrow Kit lends up to health ~1.236, and positions read PENDING for a
// moment after each change.
export class SimArc implements ArcBackend {
  readonly mode = "sim" as const;
  readonly address = "simulated-wallet";
  marketId: string | null = "0xsim-cirbtc-usdc";
  lltv = 0.86;
  vault = { address: "0xsim-vault", name: "Simulated USDC vault", apy: 0.042 };
  loanId: string | null = "sim-loan";
  private oracle = 75_000;
  private collateral = 0.0001;
  private debt = 0;
  private savings = 10;
  private walletUsdc = 3;
  private pendingUntil = 0;

  constructor(private cfg: Config, startPrice = 64_000) {
    this.debt = (this.collateral * startPrice * this.lltv) / 1.4;   // calm start: health 1.40 on the real price
  }

  private fake(label: string): TxRef[] {
    const hash = "0x" + randomBytes(32).toString("hex");
    return [{ label: `${label} (simulated)`, hash, url: "" }];
  }
  private touch() {
    this.pendingUntil = Date.now() + 1500;
  }
  private async lag() {
    await new Promise((r) => setTimeout(r, 400));
  }

  async init() {}

  async readLoan(): Promise<LoanView> {
    const pending = Date.now() < this.pendingUntil;
    const hf = (this.collateral * this.oracle * this.lltv) / this.debt;
    const liq = this.debt / (this.collateral * this.lltv);
    return {
      loanId: "sim-loan",
      marketId: this.marketId!,
      status: "active",
      dataStatus: pending ? "PENDING" : "READY",
      debt: pending ? null : this.debt,
      collateral: pending ? null : this.collateral,
      accruedInterest: pending ? null : 0,
      borrowApy: 0.00025,
      healthFactor: pending ? null : hf,
      band: pending ? null : hf >= 1.2 ? "SAFE" : hf >= 1.1 ? "WARN" : hf >= 1.05 ? "URGENT" : hf >= 1 ? "IMMINENT" : "LIQUIDATABLE",
      ltv: pending ? null : this.lltv / hf,
      liquidationPrice: pending ? null : liq,
      oraclePrice: pending ? null : this.oracle,
    };
  }
  async readSavings(): Promise<SavingsView> {
    return { vaultAddress: this.vault.address, vaultName: this.vault.name, balance: this.savings, apy: this.vault.apy };
  }
  async readWallet(): Promise<WalletView> {
    return { address: this.address, usdc: this.walletUsdc, cirbtc: 0 };
  }
  async moveSavingsIntoLoan(amount: number): Promise<Move> {
    const a = Math.min(amount, this.savings, this.debt);
    await this.lag();
    this.savings -= a;
    this.debt -= a;
    this.touch();
    return { amount: a, txs: [...this.fake("withdraw from savings"), ...this.fake("repay loan")] };
  }
  async giveBack(amount: number): Promise<Move> {
    await this.lag();
    this.debt += amount;
    this.savings += amount;
    this.touch();
    return { amount, txs: [...this.fake("borrow back"), ...this.fake("deposit into savings")] };
  }
  async borrowMore(amount: number): Promise<Move> {
    const max = (await this.maxDebt()) - this.debt;
    if (amount > max + 1e-9) throw new Error(`Borrow Kit would refuse: at most ${max.toFixed(4)} USDC more`);
    await this.lag();
    this.debt += amount;
    this.walletUsdc += amount;
    this.touch();
    return { amount, txs: this.fake("borrow more") };
  }
  async repayFromWallet(amount: number): Promise<Move> {
    const a = Math.min(amount, this.walletUsdc, this.debt);
    await this.lag();
    this.debt -= a;
    this.walletUsdc -= a;
    this.touch();
    return { amount: a, txs: this.fake("repay from wallet") };
  }
  async depositToSavings(amount: number): Promise<Move> {
    const a = Math.min(amount, this.walletUsdc);
    this.walletUsdc -= a;
    this.savings += a;
    return { amount: a, txs: this.fake("deposit into savings") };
  }
  async maxDebt(): Promise<number> {
    return (this.collateral * this.oracle * this.lltv) / 1.2361;
  }
  async registerWebhook(url: string | null): Promise<string> {
    return url ?? "(removed)";
  }
}

export function makeArc(cfg: Config, startPrice?: number): ArcBackend {
  return cfg.mode === "sim" ? new SimArc(cfg, startPrice) : new LiveArc(cfg);
}
