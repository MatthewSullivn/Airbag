// Give the local Airbag server a public https link with a free Cloudflare quick tunnel (no account).
//   npm run tunnel            -> start the tunnel, wait until the link answers, register it as the
//                                loan's Borrow Kit webhook, print the QuickNode destination
//   npm run tunnel -- --no-register    (only the tunnel)
// Start the server first (npm start). The link changes every time the tunnel restarts, so re-run
// this and update the QuickNode Stream's destination. Ctrl+C stops the tunnel.
// cloudflared: tools/cloudflared.exe (see README) or on PATH.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { config } from "../src/config.js";
import { LiveArc } from "../src/arc.js";

const register = !process.argv.includes("--no-register");
const local = `http://localhost:${config.port}`;
const bin = ["tools/cloudflared.exe", "tools/cloudflared"].find((p) => existsSync(p)) ?? "cloudflared";

// the local server must be up first
try {
  await fetch(`${local}/healthz`, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`Nothing answers on ${local}. Start the server first: npm start`);
  process.exit(1);
}

const child = spawn(bin, ["tunnel", "--no-autoupdate", "--url", local], { stdio: ["ignore", "pipe", "pipe"] });
const stop = () => { child.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => { console.log(`cloudflared exited (${code})`); process.exit(code ?? 0); });

let found = false;
const onData = (buf: Buffer) => {
  const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !found) {
    found = true;
    void ready(m[0]);
  }
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);

async function ready(url: string) {
  // a new quick tunnel takes a few seconds before it answers
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) break;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/public-url.txt", url + "\n");
  const key = config.webhookSecret ? "?key=<WEBHOOK_SECRET from .env>" : "";
  console.log(`\nPublic dashboard:           ${url}`);
  console.log(`QuickNode Stream webhook:   ${url}/api/stream${key}`);
  console.log(`Borrow Kit webhook:         ${url}/api/borrow-webhook${key}`);
  if (register && config.mode === "live" && config.privateKey) {
    try {
      const arc = new LiveArc({ ...config, publicUrl: url });
      await arc.init();
      const hook = `${url}/api/borrow-webhook${config.webhookSecret ? `?key=${encodeURIComponent(config.webhookSecret)}` : ""}`;
      await arc.registerWebhook(hook);
      console.log(`Registered the Borrow Kit webhook for loan ${arc.loanId}.`);
    } catch (e) {
      console.log(`Could not register the Borrow Kit webhook: ${(e as Error).message}`);
    }
  }
  console.log("\nTunnel is up. Leave this running; Ctrl+C stops it.");
}
