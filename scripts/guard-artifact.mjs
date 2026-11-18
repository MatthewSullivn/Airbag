// Copies what the server and the page need from Foundry's build output into a small committed file,
// so a host without Foundry (Render) can still deploy and recognise AirbagGuard.
//   npm run guard:artifact      (runs forge build first)
// Re-run it whenever contracts/src/AirbagGuard.sol changes, and commit the result.
import { readFileSync, writeFileSync } from "node:fs";

const built = JSON.parse(readFileSync("contracts/out/AirbagGuard.sol/AirbagGuard.json", "utf8"));
const artifact = {
  contract: "AirbagGuard",
  source: "contracts/src/AirbagGuard.sol",
  abi: built.abi,
  bytecode: built.bytecode.object,                                   // creation code: what a wallet sends to deploy it
  deployedBytecode: built.deployedBytecode.object,                   // runtime code: what sits on-chain afterwards
  immutableReferences: built.deployedBytecode.immutableReferences,   // where owner, morpho, vault, market and USDC are baked in
};
writeFileSync("contracts/AirbagGuard.artifact.json", JSON.stringify(artifact, null, 1) + "\n");
console.log(`wrote contracts/AirbagGuard.artifact.json (creation ${(artifact.bytecode.length - 2) / 2} bytes, runtime ${(artifact.deployedBytecode.length - 2) / 2} bytes)`);
