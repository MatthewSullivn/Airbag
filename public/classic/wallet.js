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
const REFRESH_MS = 5_000;

const isAddress = (x) => /^0x[0-9a-fA-F]{40}$/.test(x);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (x) => `$${Math.round(x).toLocaleString("en-US")}`;
const usdc = (x) => `${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x) => (x > 0 && x < 0.001 ? "<0.1%" : x < 0.1 ? `${+(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const card = $("wallet-card"), note = $("wallet-note"), button = $("wallet-connect");
let address = null, how = "", timer = null, explorer = ARC.blockExplorerUrls[0], busy = false, lastView = null;

// Which wallet app. Several extensions can be installed at once (MetaMask, Phantom, ...) and they fight over
// window.ethereum. With EIP-6963 each one announces itself, so the visitor picks instead of getting whichever won.
// `eth` is the wallet the visitor chose; nothing below touches window.ethereum directly.
const found = new Map();
window.addEventListener("eip6963:announceProvider", (e) => {
  const d = e.detail;
  if (d?.provider && d?.info?.uuid) found.set(d.info.uuid, { name: String(d.info.name ?? "Wallet").slice(0, 40), provider: d.provider });
});
const askWallets = () => window.dispatchEvent(new Event("eip6963:requestProvider"));
askWallets();
let eth = null, walletName = "";

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
  lastView = v;
  window.airbag?.wallet(v, how);   // app.js shows this wallet's loan in the big number and the cards
  $("wallet-addr").replaceChildren(`${how === "connected" ? `connected with ${walletName}` : how} · `, link(`${explorer}/address/${v.address}`, short(v.address)));

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
    note.textContent = v.protectedHere || v.protection?.guard
      ? "Airbag is protecting this wallet's loan."
      : L
        ? how === "connected" ? "Airbag is not protecting this loan yet. You can turn protection on below." : "Airbag is not protecting this loan. Connect this wallet to turn protection on."
        : how === "connected"
          ? v.cirbtc > 0 ? "No loan yet. You can open one below." : "No loan and no cirBTC yet. Get test cirBTC at faucet.circle.com (Arc Testnet) to open a loan."
          : "Read-only. Connect this wallet to open a loan or add savings from here.";
  renderActions(v);
}

// Right after the visitor's own transaction: look often and skip the server's short cache, so the pushed loan
// and the bot's answer both show up on the page within a second or two.
let closeUntil = 0;
function keepLooking() {
  clearTimeout(timer);
  const left = closeUntil - Date.now();
  timer = setTimeout(async () => { await load(); if (address) keepLooking(); }, left > 33_000 ? 1_000 : left > 0 ? 2_000 : REFRESH_MS);
}

async function load() {
  if (!address) return;
  const asked = address;
  try {
    const res = await fetch(`/api/wallet/${asked}${Date.now() < closeUntil ? "?fresh=1" : ""}`, { cache: "no-store" });
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
  $("wallet-addr").textContent = `${source === "connected" ? `connected with ${walletName}` : source} · ${short(next)}`;
  $("wallet-do").hidden = true;
  $("wallet-pick").hidden = true;
  $("wallet-steps").replaceChildren();
  for (const id of ["w-open-collateral", "w-open-borrow", "w-save-amount", "w-protect-cap"]) { $(id).value = ""; delete $(id).dataset.touched; }
  lastView = null;
  note.textContent = "Reading Arc Testnet…";
  button.textContent = source === "connected" ? `${walletName} ${short(next)}` : "Connect wallet";
  const viaExtension = source === "connected" && !!eth;
  $("wallet-add-chain").hidden = !viaExtension;
  $("wallet-add-token").hidden = !viaExtension;
  window.airbag?.wallet(null);
  load();
  keepLooking();
}

const onAccounts = (accounts) => {
  if (how !== "connected") return;
  if (accounts?.[0] && isAddress(accounts[0])) show(accounts[0], "connected");
  else hide();
};
function forget() {
  eth?.removeListener?.("accountsChanged", onAccounts);
  eth = null;
  walletName = "";
}
function hide() {
  card.hidden = true;
  address = null;
  clearTimeout(timer);
  window.airbag?.wallet(null);
  forget();
  button.textContent = "Connect wallet";
}

/** Connect ONE wallet app, the one the visitor picked. Asks it for its address and nothing else. */
async function connect(provider, name) {
  $("wallet-pick").hidden = true;
  card.hidden = false;
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts?.[0] || !isAddress(accounts[0])) throw new Error("the wallet returned no account");
    forget();
    eth = provider;
    walletName = name;
    eth.on?.("accountsChanged", onAccounts);
    show(accounts[0], "connected");
  } catch (e) {
    note.textContent = e?.code === 4001 ? "Connection cancelled." : `Could not connect: ${e?.message ?? e}`;
  }
}

button.addEventListener("click", async () => {
  askWallets();
  await sleep(80);                                   // wallets answer the request with their announcements
  const list = [...found.values()];
  if (list.length === 1) return connect(list[0].provider, list[0].name);
  if (!list.length && window.ethereum) return connect(window.ethereum, "your wallet");   // an older wallet that does not announce itself
  card.hidden = false;
  if (!address) { blank(); $("wallet-addr").textContent = ""; }
  if (!list.length) {
    note.textContent = "No wallet extension found in this browser. Paste an address below instead.";
    $("wallet-input").focus();
    return;
  }
  // several wallets installed: the visitor chooses, so a wallet they did not mean to use is never asked
  const pick = $("wallet-pick");
  pick.replaceChildren("Which wallet? ");
  for (const w of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = w.name;
    b.addEventListener("click", () => connect(w.provider, w.name));
    pick.append(b);
  }
  pick.hidden = false;
  note.textContent = "Several wallet extensions are installed. Pick the one to connect.";
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
  if (!eth) return;
  try { await eth.request(request); note.textContent = `${label}: done.`; }
  catch (e) { note.textContent = e?.code === 4001 ? `${label}: cancelled.` : `${label} failed: ${e?.message ?? e}`; }
};
$("wallet-add-chain").addEventListener("click", ask("Add Arc Testnet", { method: "wallet_addEthereumChain", params: [ARC] }));
$("wallet-add-token").addEventListener("click", ask("Add cirBTC", { method: "wallet_watchAsset", params: { type: "ERC20", options: CIRBTC } }));


// ------------------------------------------------------------------ doing (connected wallets only)
const INPUTS = ["w-open-collateral", "w-open-borrow", "w-save-amount", "w-protect-cap"];
const prefill = (id, value) => { const i = $(id); if (!i.dataset.touched && document.activeElement !== i) i.value = value; };
for (const id of INPUTS) $(id).addEventListener("input", (e) => (e.target.dataset.touched = "1"));

// The page remembers the guard a wallet created, so an interrupted setup can be finished instead of started over.
const guardKey = (owner) => `airbag-guard:${owner.toLowerCase()}`;
const recall = (owner) => { try { const g = localStorage.getItem(guardKey(owner)); return g && isAddress(g) ? g : null; } catch { return null; } };
const remember = (owner, guard) => { try { guard ? localStorage.setItem(guardKey(owner), guard) : localStorage.removeItem(guardKey(owner)); } catch { /* storage blocked */ } };
const askedToWatch = new Set();

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function renderActions(v) {
  const connected = how === "connected" && !!eth;
  $("wallet-do").hidden = !connected;
  if (!connected) return;
  set("wallet-signer", `Anything you do here is signed by ${walletName}, account ${short(v.address)}, on Arc Testnet.`);
  const o = v.offers, P = v.protection ?? {}, guard = P.guard;

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

  // protection: off -> the form; on -> what it is doing, the demo buttons, and the off switch
  const form = $("w-protect-form"), on = $("w-protected");
  form.hidden = !(v.loan && !guard && !v.protectedHere);
  on.hidden = !guard;
  if (!form.hidden) {
    prefill("w-protect-cap", String(o.suggestCap));
    const blocked = !P.available ? P.why : v.savings < 0.01 ? "Add savings first. Protection moves your savings into your loan, so there has to be some." : "";
    if (!busy) form.querySelector("button").disabled = !!blocked;
    form.querySelector("button").textContent = recall(v.address) ? "Finish turning on protection" : "Turn on protection";
    set("w-protect-hint", blocked || "Three signatures: create your guard, then let it reach your savings and your loan. It can only move money between the two.");
  }
  if (guard) {
    const text = $("w-protected-text");
    text.replaceChildren("Airbag watches this loan through your guard ", link(`${explorer}/address/${guard.address}`, short(guard.address)), `. It may move up to ${guard.capUsdc} USDC a day.`);
    if (guard.inLoan > 0) text.append(` ${usdc(guard.inLoan)} USDC of your savings is inside the loan now and comes back when it is calm.`);
    if (guard.lastMove) text.append(" Last move: ", link(`${explorer}/tx/${guard.lastMove.tx}`, `${guard.lastMove.kind === "save" ? "saved" : "gave back"} ${usdc(guard.lastMove.usdc)} USDC`), ".");
    if (guard.lastError) text.append(` Problem: ${guard.lastError}.`);
  } else if (P.available && v.loan && recall(v.address) && !askedToWatch.has(v.address)) {
    // a guard made earlier from this browser: ask the server to watch it again (it checks the guard on-chain itself)
    askedToWatch.add(v.address);
    post("/api/protect", { guard: recall(v.address) }).then(load).catch(() => {});
  }
}

function stepLine(text, cls) {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.className = cls;
  $("wallet-steps").append(li);
  return li;
}
const reason = (e) => String(e?.data?.message ?? e?.message ?? e).split("\n")[0].slice(0, 180);

async function ensureArc(wallet) {
  if (String(await wallet.request({ method: "eth_chainId" })).toLowerCase() === ARC.chainId) return;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC.chainId }] });
  } catch (e) {
    if (e?.code === 4001) throw e;
    await wallet.request({ method: "wallet_addEthereumChain", params: [ARC] });   // the wallet did not know Arc yet
  }
}
async function confirmed(wallet, hash) {
  for (let i = 0; i < 150; i++) {
    const receipt = await wallet.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) return receipt;
    await sleep(700);
  }
  throw new Error("not confirmed after a while. Check it on the explorer before trying again.");
}

/** Ask the server for one plan, then have the wallet sign and send its steps one by one. Returns the receipts. */
async function execute(wallet, from, action, body) {
  const plan = await post(`/api/plan/${action}`, { address: from, ...body });
  stepLine(plan.summary);
  const receipts = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i], n = `${s.label}.`;
    const li = stepLine(`${n} Confirm it in your wallet…`);
    const tx = { from, data: s.data, value: s.value };
    if (s.to) tx.to = s.to;                              // no "to" = this step creates a contract
    try { await wallet.request({ method: "eth_estimateGas", params: [tx] }); }
    catch (e) { throw new Error(`"${s.label}" would fail, so it was not sent: ${reason(e)}`); }
    const hash = await wallet.request({ method: "eth_sendTransaction", params: [tx] });
    li.replaceChildren(`${n} Sent, waiting for Arc… `, link(`${explorer}/tx/${hash}`, "transaction ↗"));
    const receipt = await confirmed(wallet, hash);
    if (receipt.status !== "0x1") throw new Error(`"${s.label}" was rejected by the contract.`);
    li.className = "done";
    li.replaceChildren(`${n} Done. `, link(`${explorer}/tx/${hash}`, "transaction ↗"));
    receipts.push(receipt);
  }
  return receipts;
}

/** Runs one job with the chosen wallet: one at a time, buttons off meanwhile, a plain line if it stops. */
async function withWallet(job, done = "All done.") {
  const wallet = eth, from = address;
  if (busy || !from || !wallet) return;
  busy = true;
  window.airbag?.show(true);   // the visitor is working on their own loan: put it in the big number
  const buttons = [...$("wallet-do").querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  $("wallet-steps").replaceChildren();
  try {
    await ensureArc(wallet);
    await job(wallet, from);
    stepLine(done, "done");
    for (const id of INPUTS) delete $(id).dataset.touched;
  } catch (e) {
    stepLine(e?.code === 4001 ? "Cancelled in the wallet. Nothing more was sent." : `Stopped: ${reason(e)}`, "failed");
  } finally {
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
    closeUntil = Date.now() + 45_000;
    await sleep(300);
    await load();
    keepLooking();
  }
}
const run = (action, body, done) => withWallet((wallet, from) => execute(wallet, from, action, body), done);

$("w-open-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run("open-loan", { collateral: $("w-open-collateral").value.trim(), borrow: $("w-open-borrow").value.trim() });
});
$("w-save-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run("add-savings", { amount: $("w-save-amount").value.trim() });
});

// Turning protection on: the wallet creates its own guard, gives it two permissions, and the bot starts watching.
$("w-protect-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const cap = $("w-protect-cap").value.trim();
  withWallet(async (wallet, from) => {
    let guard = recall(from);
    if (guard) {
      // an earlier try already created a guard: finish that one instead of creating another
      try { await execute(wallet, from, "protect-finish", { guard }); }
      catch (err) { if (/not an AirbagGuard|different|not a contract/i.test(String(err?.message))) { remember(from, null); guard = null; } else throw err; }
    }
    if (!guard) {
      const [created] = await execute(wallet, from, "protect", { cap });
      guard = created?.contractAddress;
      if (!guard || !isAddress(guard)) throw new Error("the wallet did not report the new contract's address");
      remember(from, guard);
      await execute(wallet, from, "protect-finish", { guard });
    }
    await post("/api/protect", { guard });
  }, "Protection is on. The bot is watching this loan now.");
});
$("w-unprotect").addEventListener("click", () =>
  withWallet(async (wallet, from) => {
    const guard = lastView?.protection?.guard?.address ?? recall(from);
    await execute(wallet, from, "unprotect", {});
    remember(from, null);
    if (guard) await post("/api/protect/refresh", { guard }).catch(() => {});
  }, "Protection is off. The bot can no longer touch this wallet's savings or loan."));
$("w-push").addEventListener("click", () => run("push", {}, "Pushed. Now keep your hands off and watch the bot."));
$("w-calm").addEventListener("click", () => run("calm", {}, "Calmer. The bot gives your savings back by itself when it is safe to."));
