// The page in public/ is built from web/ and the built files are committed (the server and Render never build).
// So a change in web/ without a rebuild would ship an old page. This catches it: the build stamps a hash of its
// sources into public/build.json, and here we compute that hash again.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { sourceHash } from "../web/scripts/hash.mjs";

const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

test("the built page in public/ is up to date with web/ (if not: npm run web:build, then commit public/)", () => {
  assert.ok(existsSync(pub("build.json")), "public/build.json is missing: run npm run web:build");
  const { sources } = JSON.parse(readFileSync(pub("build.json"), "utf8"));
  assert.equal(sources, sourceHash(), "web/ changed since the last build: run npm run web:build and commit public/ too");
});

test("both pages and the old page are there to serve", () => {
  for (const p of ["index.html", "app/index.html", "classic/index.html", "classic/app.js", "classic/wallet.js", "classic/style.css"])
    assert.ok(existsSync(pub(p)), `public/${p} is missing`);
  // every script and stylesheet a built page points at exists
  for (const page of ["index.html", "app/index.html"]) {
    const html = readFileSync(pub(page), "utf8");
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(assets.length > 0, `${page} points at no built assets`);
    for (const a of assets) assert.ok(existsSync(pub(a.slice(1))), `${page} points at ${a}, which is missing`);
  }
});

test("the signing code still makes the wallet requests the classic page was proven with", () => {
  // The same requests, in the same order, were checked in a browser against the classic page with a fake wallet.
  // This only guards the file against an accidental rewrite: each call must still be there.
  const core = readFileSync(fileURLToPath(new URL("../web/src/wallet/core.js", import.meta.url)), "utf8");
  for (const call of ["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_estimateGas", "eth_sendTransaction", "eth_getTransactionReceipt"])
    assert.ok(core.includes(`"${call}"`), `core.js no longer makes the ${call} request`);
  for (const path of ["/api/plan/", "/api/protect", "/api/protect/refresh"]) assert.ok(core.includes(path), `core.js no longer calls ${path}`);
  const order = ['"eth_estimateGas"', '"eth_sendTransaction"', "await confirmed(wallet, hash)"].map((s) => core.indexOf(s));
  assert.ok(order.every((i) => i >= 0), "execute() no longer estimates, sends and waits");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "estimate, then send, then wait for the receipt: that order must hold");
});
