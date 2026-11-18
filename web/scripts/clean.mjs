// Removes only what a previous build wrote into ../public. Everything else there (classic/) stays.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../public");
for (const name of ["assets", "app", "index.html", "build.json"]) rmSync(resolve(out, name), { recursive: true, force: true });
