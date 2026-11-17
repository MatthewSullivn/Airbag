// Print the bot wallet's USDC and cirBTC on Arc Testnet.   npm run balances
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { CIRBTC, USDC, config } from "../src/config.js";

const address = config.botAddress || privateKeyToAccount(config.privateKey as `0x${string}`).address;
const client = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl) });
const [usdc, btc, native] = await Promise.all([
  client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address as `0x${string}`] }),
  client.readContract({ address: CIRBTC, abi: erc20Abi, functionName: "balanceOf", args: [address as `0x${string}`] }),
  client.getBalance({ address: address as `0x${string}` }),
]);
console.log(`wallet  ${address}`);
console.log(`USDC    ${formatUnits(usdc, 6)}   (native gas balance ${formatUnits(native, 18)})`);
console.log(`cirBTC  ${formatUnits(btc, 8)}`);
console.log(`explorer ${config.explorer}/address/${address}`);
