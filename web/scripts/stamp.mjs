import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sourceHash, webDir } from "./hash.mjs";

writeFileSync(resolve(webDir, "../public/build.json"), JSON.stringify({ sources: sourceHash() }) + "\n");
console.log("stamped public/build.json");
