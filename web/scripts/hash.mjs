// One hash over the page's sources. The build writes it into public/build.json; test/web-build.test.mjs
// recomputes it, so a commit that changes web/ without rebuilding fails the tests.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

export const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// ../src/brain.mjs, hedge.mjs, market-history.mjs and crash-test.mjs are bundled into the page too (it uses the bot's own maths),
// and so is the February replay (replay/results.json): a re-run replay needs a rebuilt page
const ROOT_FILES = ["index.html", "app/index.html", "package.json", "vite.config.ts", "tsconfig.json", "../src/brain.mjs", "../src/hedge.mjs", "../src/market-history.mjs", "../src/crash-test.mjs", "../replay/results.json"];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function sourceHash() {
  const files = [...walk(join(webDir, "src")), ...ROOT_FILES.map((f) => join(webDir, f))]
    .map((p) => relative(webDir, p).replaceAll("\\", "/"))
    .sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f + "\n");
    // line endings differ between machines (git on Windows may check text out with CRLF): hash them away
    h.update(readFileSync(join(webDir, f)).toString("latin1").replaceAll("\r\n", "\n"));
    h.update("\n");
  }
  return h.digest("hex");
}
