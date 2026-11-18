// The wallet logic of the classic page (public/classic/wallet.js), moved here.
//
// DO NOT "IMPROVE" THIS FILE. These are the same wallet requests and the same server calls, in the same order,
// that were proven on Arc Testnet on Nov 18, 2026 (README "Live proof"). They cannot be tested again without a
// person signing in their wallet. The only change from the classic page: where it wrote text into the page,
// this calls the `ui` callbacks instead, so the React page can draw the steps its own way.
//
// - Looking: connecting only shares the address.
// - Doing: the server prepares each transaction (POST /api/plan/...), and the visitor's wallet shows it,
//   signs it and sends it. This page never sees a key.

export const ARC = {
  chainId: "0x4cef52",   // 5042002
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.io"],
  blockExplorerUrls: ["https://explorer.testnet.arc.io"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
};
export const CIRBTC = { address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", symbol: "cirBTC", decimals: 8 };

export const isAddress = (x) => /^0x[0-9a-fA-F]{40}$/.test(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Which wallet app. Several extensions can be installed at once (MetaMask, Phantom, ...) and they fight over
// window.ethereum. With EIP-6963 each one announces itself, so the visitor picks instead of getting whichever won.
const found = new Map();
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = e.detail;
    if (d?.provider && d?.info?.uuid) found.set(d.info.uuid, { name: String(d.info.name ?? "Wallet").slice(0, 40), provider: d.provider });
  });
}
export const askWallets = () => window.dispatchEvent(new Event("eip6963:requestProvider"));
if (typeof window !== "undefined") askWallets();

/**
 * The wallet apps in this browser, after giving them a moment to answer.
 * One entry: connect it. None, but an older wallet on window.ethereum: that one, named "your wallet".
 * Several: the visitor chooses, so a wallet they did not mean to use is never asked.
 */
export async function listWallets() {
  askWallets();
  await sleep(80);                                   // wallets answer the request with their announcements
  const list = [...found.values()];
  if (!list.length && window.ethereum) return [{ name: "your wallet", provider: window.ethereum }];   // an older wallet that does not announce itself
  return list;
}

/** Connect ONE wallet app, the one the visitor picked. Asks it for its address and nothing else. */
export async function requestAccount(provider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0] || !isAddress(accounts[0])) throw new Error("the wallet returned no account");
  return accounts[0];
}

// Two helpers for wallets that do not know Arc yet. Each opens the wallet's own confirmation window.
export const addArcRequest = { method: "wallet_addEthereumChain", params: [ARC] };
export const addCirbtcRequest = { method: "wallet_watchAsset", params: { type: "ERC20", options: CIRBTC } };

// The page remembers the guard a wallet created, so an interrupted setup can be finished instead of started over.
const guardKey = (owner) => `airbag-guard:${owner.toLowerCase()}`;
export const recall = (owner) => { try { const g = localStorage.getItem(guardKey(owner)); return g && isAddress(g) ? g : null; } catch { return null; } };
export const remember = (owner, guard) => { try { guard ? localStorage.setItem(guardKey(owner), guard) : localStorage.removeItem(guardKey(owner)); } catch { /* storage blocked */ } };

export async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const reason = (e) => String(e?.data?.message ?? e?.message ?? e).split("\n")[0].slice(0, 180);

export async function ensureArc(wallet) {
  if (String(await wallet.request({ method: "eth_chainId" })).toLowerCase() === ARC.chainId) return;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC.chainId }] });
  } catch (e) {
    if (e?.code === 4001) throw e;
    await wallet.request({ method: "wallet_addEthereumChain", params: [ARC] });   // the wallet did not know Arc yet
  }
}

export async function confirmed(wallet, hash) {
  for (let i = 0; i < 150; i++) {
    const receipt = await wallet.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) return receipt;
    await sleep(700);
  }
  throw new Error("not confirmed after a while. Check it on the explorer before trying again.");
}

/**
 * Ask the server for one plan, then have the wallet sign and send its steps one by one. Returns the receipts.
 * ui.summary(text): the plan's one-line summary.
 * ui.step(label): a new step, waiting for the wallet. Returns { sent(hash), done(hash) } to move it along.
 */
export async function execute(wallet, from, action, body, ui) {
  const plan = await post(`/api/plan/${action}`, { address: from, ...body });
  ui.summary(plan.summary);
  const receipts = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    const line = ui.step(s.label);
    const tx = { from, data: s.data, value: s.value };
    if (s.to) tx.to = s.to;                              // no "to" = this step creates a contract
    try { await wallet.request({ method: "eth_estimateGas", params: [tx] }); }
    catch (e) { throw new Error(`"${s.label}" would fail, so it was not sent: ${reason(e)}`); }
    const hash = await wallet.request({ method: "eth_sendTransaction", params: [tx] });
    line.sent(hash);
    const receipt = await confirmed(wallet, hash);
    if (receipt.status !== "0x1") throw new Error(`"${s.label}" was rejected by the contract.`);
    line.done(hash);
    receipts.push(receipt);
  }
  return receipts;
}

/** Turning protection on: the wallet creates its own guard, gives it two permissions, and the bot starts watching. */
export async function turnOnProtection(wallet, from, cap, ui) {
  let guard = recall(from);
  if (guard) {
    // an earlier try already created a guard: finish that one instead of creating another
    try { await execute(wallet, from, "protect-finish", { guard }, ui); }
    catch (err) { if (/not an AirbagGuard|different|not a contract/i.test(String(err?.message))) { remember(from, null); guard = null; } else throw err; }
  }
  if (!guard) {
    const [created] = await execute(wallet, from, "protect", { cap }, ui);
    guard = created?.contractAddress;
    if (!guard || !isAddress(guard)) throw new Error("the wallet did not report the new contract's address");
    remember(from, guard);
    await execute(wallet, from, "protect-finish", { guard }, ui);
  }
  await post("/api/protect", { guard });
  return guard;
}

/** Turning protection off: the wallet takes both permissions back, and the server stops watching that guard. */
export async function turnOffProtection(wallet, from, knownGuard, ui) {
  const guard = knownGuard ?? recall(from);
  await execute(wallet, from, "unprotect", {}, ui);
  remember(from, null);
  if (guard) await post("/api/protect/refresh", { guard }).catch(() => {});
}
