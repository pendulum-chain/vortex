import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import erc20ABI from "../../../contracts/ERC20";
import Big from "big.js";

export function checkMoonbeamBalancePeriodically(
    tokenAddress: string,
    brlaEvmAddress: string,
    amountDesiredRaw: string,
    intervalMs: number,
    timeoutMs: number,
  ) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const intervalId = setInterval(async () => {
        try {
          const publicClient = createPublicClient({
            chain: polygon,
            transport: http(),
          });
  
          const result = (await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20ABI,
            functionName: 'balanceOf',
            args: [brlaEvmAddress],
          })) as string;
  
          console.log(`Polygon balance check: ${result.toString()} / ${amountDesiredRaw.toString()}`);
          const someBalanceBig = new Big(result.toString());
          const amountDesiredUnitsBig = new Big(amountDesiredRaw);
  
          if (someBalanceBig.gte(amountDesiredUnitsBig)) {
            clearInterval(intervalId);
            resolve(someBalanceBig);
          } else if (Date.now() - startTime > timeoutMs) {
            clearInterval(intervalId);
            reject(new Error(`Balance did not meet the limit within the specified time (${timeoutMs} ms)`));
          }
        } catch (error) {
          clearInterval(intervalId);
          reject(new Error(`Error checking balance: ${error}`));
        }
      }, intervalMs);
    });
  }