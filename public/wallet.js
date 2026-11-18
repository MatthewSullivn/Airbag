// "Connect wallet": the visitor's own wallet on Arc Testnet.
// - Looking: connecting only shares the address. The numbers come from GET /api/wallet/:address.
// - Doing (connected wallets only): open a loan, add savings. The server prepares each transaction
//   (POST /api/plan/...), and the visitor's wallet shows it, signs it and sends it. This page never sees a key.
// All server text goes in with textContent.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const card = $("wallet-card"), note = $("wallet-note"), button = $("wallet-connect");
let address = null, how = "", timer = null, explorer = ARC.blockExplorerUrls[0], busy = false;

const set = (id, text) => ($(id).textContent = text);
function blank() {
  for (const id of ["w-usdc", "w-cirbtc", "w-loan", "w-odds"]) set(id, "–");
  for (const id of ["w-usdc-sub", "w-cirbtc-sub", "w-loan-sub", "w-odds-sub"]) set(id, "");
}
function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

// ------------------------------------------------------------------ looking
function render(v) {
  explorer = v.explorer || explorer;
  $("wallet-addr").replaceChildren(`${how} · `, link(`${explorer}/address/${v.address}`, short(v.address)));

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
  if (!busy)
    note.textContent = v.protectedHere
      ? "Airbag is protecting this wallet's loan on this page."
      : L
        ? "Airbag is not protecting this loan yet. Protection is switched on with three signatures to an AirbagGuard contract. That step is not on this page yet."
        : how === "connected"
          ? v.cirbtc > 0 ? "No loan yet. You can open one below." : "No loan and no cirBTC yet. Get test cirBTC at faucet.circle.com (Arc Testnet) to open a loan."
          : "Read-only. Connect this wallet to open a loan or add savings from here.";
  renderActions(v);
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
    if (asked === address && !busy) note.textContent = `Could not read this wallet: ${e.message}`;
  }
}

function show(next, source) {
  address = next;
  how = source;
  card.hidden = false;
  blank();
  $("wallet-addr").textContent = `${source} · ${short(next)}`;
  $("wallet-do").hidden = true;
  $("wallet-steps").replaceChildren();
  for (const id of ["w-open-collateral", "w-open-borrow", "w-save-amount"]) { $(id).value = ""; delete $(id).dataset.touched; }
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

// ------------------------------------------------------------------ doing (connected wallets only)
const prefill = (id, value) => { const i = $(id); if (!i.dataset.touched && document.activeElement !== i) i.value = value; };
for (const id of ["w-open-collateral", "w-open-borrow", "w-save-amount"]) $(id).addEventListener("input", (e) => (e.target.dataset.touched = "1"));

function renderActions(v) {
  const connected = how === "connected" && !!window.ethereum;
  $("wallet-do").hidden = !connected;
  if (!connected) return;
  const o = v.offers;
  // one form covers a first loan and adding to an existing one
  const canBorrow = o.maxBorrow >= 0.01 && (v.cirbtc > 0 || !!v.loan);
  const open = $("w-open-form");
  open.hidden = !canBorrow;
  open.querySelector("strong").textContent = v.loan ? "Borrow more" : "Open a loan";
  open.querySelector("button").textContent = v.loan ? "Borrow more" : "Open loan";
  prefill("w-open-collateral", v.cirbtc > 0 ? String(+v.cirbtc.toFixed(8)) : "0");
  prefill("w-open-borrow", o.suggestBorrow >= 0.01 ? o.suggestBorrow.toFixed(2) : "");
  set("w-open-hint", `Up to ${o.maxBorrow.toFixed(2)} USDC with all your free cirBTC keeps health at ${o.minHealth} or better.`);
  $("w-save-form").hidden = !(o.savingsMax >= 0.01);
  prefill("w-save-amount", Math.min(10, o.savingsMax).toFixed(2));
  set("w-save-hint", `Up to ${o.savingsMax.toFixed(2)} USDC. The rest stays in the wallet for gas.`);
}

function stepLine(text, cls) {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.className = cls;
  $("wallet-steps").append(li);
  return li;
}
const reason = (e) => String(e?.data?.message ?? e?.message ?? e).split("\n")[0].slice(0, 160);

async function ensureArc(eth) {
  if (String(await eth.request({ method: "eth_chainId" })).toLowerCase() === ARC.chainId) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC.chainId }] });
  } catch (e) {
    if (e?.code === 4001) throw e;
    await eth.request({ method: "wallet_addEthereumChain", params: [ARC] });   // the wallet did not know Arc yet
  }
}
async function confirmed(eth, hash) {
  for (let i = 0; i < 150; i++) {
    const receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) return receipt;
    await sleep(700);
  }
  throw new Error("not confirmed after a while. Check it on the explorer before trying again.");
}

/** Ask the server for the transactions, then have the wallet sign and send them one by one. */
async function run(action, body) {
  const eth = window.ethereum;
  if (busy || !address || !eth) return;
  busy = true;
  const buttons = [...$("wallet-do").querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  $("wallet-steps").replaceChildren();
  const from = address;
  try {
    await ensureArc(eth);
    const res = await fetch(`/api/plan/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: from, ...body }) });
    const plan = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(plan.error ?? `HTTP ${res.status}`);
    stepLine(plan.summary);
    for (let i = 0; i < plan.steps.length; i++) {
      const s = plan.steps[i], n = `${i + 1} of ${plan.steps.length}: ${s.label}.`;
      const li = stepLine(`${n} Confirm it in your wallet…`);
      const tx = { from, to: s.to, data: s.data, value: s.value };
      try { await eth.request({ method: "eth_estimateGas", params: [tx] }); }
      catch (e) { throw new Error(`"${s.label}" would fail, so it was not sent: ${reason(e)}`); }
      const hash = await eth.request({ method: "eth_sendTransaction", params: [tx] });
      li.replaceChildren(`${n} Sent, waiting for Arc… `, link(`${explorer}/tx/${hash}`, "transaction ↗"));
      const receipt = await confirmed(eth, hash);
      if (receipt.status !== "0x1") throw new Error(`"${s.label}" was rejected by the contract.`);
      li.className = "done";
      li.replaceChildren(`${n} Done. `, link(`${explorer}/tx/${hash}`, "transaction ↗"));
    }
    stepLine("All done.", "done");
    for (const id of ["w-open-collateral", "w-open-borrow", "w-save-amount"]) delete $(id).dataset.touched;
  } catch (e) {
    stepLine(e?.code === 4001 ? "Cancelled in the wallet. Nothing more was sent." : `Stopped: ${reason(e)}`, "failed");
  } finally {
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
    await sleep(800);
    load();
  }
}
$("w-open-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run("open-loan", { collateral: $("w-open-collateral").value.trim(), borrow: $("w-open-borrow").value.trim() });
});
$("w-save-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run("add-savings", { amount: $("w-save-amount").value.trim() });
});
