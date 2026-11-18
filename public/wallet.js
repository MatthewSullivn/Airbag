// "Connect wallet": a read-only look at the visitor's own wallet on Arc Testnet.
// Connecting only shares the wallet's address. Nothing here asks for a signature or sends a transaction.
// The numbers come from GET /api/wallet/:address. All server text goes in with textContent.
const $ = (id) => document.getElementById(id);
const ARC = {
  chainId: "0x4cef52",   // 5042002
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.io"],
  blockExplorerUrls: ["https://explorer.testnet.arc.io"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
};
const CIRBTC = { address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", symbol: "cirBTC", decimals: 8 };
const REFRESH_MS = 10_000;

const isAddress = (x) => /^0x[0-9a-fA-F]{40}$/.test(x);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (x) => `$${Math.round(x).toLocaleString("en-US")}`;
const usdc = (x) => `${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x) => (x > 0 && x < 0.001 ? "<0.1%" : x < 0.1 ? `${+(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

const card = $("wallet-card"), note = $("wallet-note"), button = $("wallet-connect");
let address = null, how = "", timer = null;

const set = (id, text) => ($(id).textContent = text);
function blank() {
  for (const id of ["w-usdc", "w-cirbtc", "w-loan", "w-odds"]) set(id, "–");
  for (const id of ["w-usdc-sub", "w-cirbtc-sub", "w-loan-sub", "w-odds-sub"]) set(id, "");
}

function render(v) {
  const head = $("wallet-addr");
  head.replaceChildren(`${how} · `);
  const link = document.createElement("a");
  link.href = `${v.explorer}/address/${v.address}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = short(v.address);
  head.append(link);

  set("w-usdc", usdc(v.usdc));
  set("w-usdc-sub", v.savings > 0 ? `plus ${usdc(v.savings)} USDC in the savings vault` : "in the wallet");
  set("w-cirbtc", String(+v.cirbtc.toFixed(8)));
  const L = v.loan;
  set("w-cirbtc-sub", L ? `plus ${+L.collateral.toFixed(8)} locked in the loan` : "in the wallet");
  if (L) {
    set("w-loan", `${usdc(L.debt)} USDC`);
    set("w-loan-sub", `You lose your bitcoin if BTC falls under ${usd(L.line)}. Health ${L.health.toFixed(2)} at BTC ${usd(L.priceUsed)}.`);
    set("w-odds", L.odds ? pct(L.odds.odds) : "–");
    set("w-odds-sub", L.odds ? `${L.oddsBy ? `by ${day(L.oddsBy)}, ` : ""}from Gemini's prediction market (${L.odds.source})` : "Gemini has no odds right now.");
  } else {
    set("w-loan", "No loan");
    set("w-loan-sub", "This wallet has no loan in Arc's cirBTC/USDC market.");
    set("w-odds", "–");
    set("w-odds-sub", "Nothing at risk.");
  }
  note.textContent = v.protectedHere
    ? "Airbag is protecting this wallet's loan on this page."
    : L
      ? "Airbag is not protecting this loan. Protection is switched on with three signatures to an AirbagGuard contract. That step is not on this page yet."
      : "Read-only. Connecting shares only your address; nothing is signed or sent.";
}

async function load() {
  if (!address) return;
  const asked = address;
  try {
    const res = await fetch(`/api/wallet/${asked}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (asked !== address) return;                    // the visitor switched wallets meanwhile
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    render(body);
  } catch (e) {
    if (asked === address) note.textContent = `Could not read this wallet: ${e.message}`;
  }
}

function show(next, source) {
  address = next;
  how = source;
  card.hidden = false;
  blank();
  $("wallet-addr").textContent = `${source} · ${short(next)}`;
  note.textContent = "Reading Arc Testnet…";
  button.textContent = source === "connected" ? `Wallet ${short(next)}` : "Connect wallet";
  const viaExtension = source === "connected" && !!window.ethereum;
  $("wallet-add-chain").hidden = !viaExtension;
  $("wallet-add-token").hidden = !viaExtension;
  clearInterval(timer);
  timer = setInterval(load, REFRESH_MS);
  load();
}

function hide() {
  card.hidden = true;
  address = null;
  clearInterval(timer);
  button.textContent = "Connect wallet";
}

button.addEventListener("click", async () => {
  const eth = window.ethereum;
  if (!eth) {
    card.hidden = false;
    if (!address) { blank(); $("wallet-addr").textContent = ""; }
    note.textContent = "No wallet extension found in this browser. Paste an address below instead.";
    $("wallet-input").focus();
    return;
  }
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    if (accounts?.[0] && isAddress(accounts[0])) show(accounts[0], "connected");
  } catch (e) {
    card.hidden = false;
    note.textContent = e?.code === 4001 ? "Connection cancelled." : `Could not connect: ${e?.message ?? e}`;
  }
});
window.ethereum?.on?.("accountsChanged", (accounts) => {
  if (how !== "connected") return;
  if (accounts?.[0] && isAddress(accounts[0])) show(accounts[0], "connected");
  else hide();
});

$("wallet-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("wallet-input").value.trim();
  if (!isAddress(value)) { note.textContent = "That is not a wallet address. It should be 0x followed by 40 characters."; return; }
  show(value, "looked up");
});
$("wallet-close").addEventListener("click", hide);

// Two helpers for wallets that do not know Arc yet. Each opens the wallet's own confirmation window.
const ask = (label, request) => async () => {
  try { await window.ethereum.request(request); note.textContent = `${label}: done.`; }
  catch (e) { note.textContent = e?.code === 4001 ? `${label}: cancelled.` : `${label} failed: ${e?.message ?? e}`; }
};
$("wallet-add-chain").addEventListener("click", ask("Add Arc Testnet", { method: "wallet_addEthereumChain", params: [ARC] }));
$("wallet-add-token").addEventListener("click", ask("Add cirBTC", { method: "wallet_watchAsset", params: { type: "ERC20", options: CIRBTC } }));
