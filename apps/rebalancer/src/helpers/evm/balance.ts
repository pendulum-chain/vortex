import Big from "big.js";
import { type Chain, createPublicClient, http } from "viem";
import erc20ABI from "../../contracts/ERC20.ts";

type EvmAddress = `0x${string}`;

export enum BalanceCheckErrorType {
  Timeout = "BALANCE_CHECK_TIMEOUT",
  ReadFailure = "BALANCE_CHECK_READ_FAILURE"
}

export class BalanceCheckError extends Error {
  constructor(
    public readonly type: BalanceCheckErrorType,
    message: string
  ) {
    super(message);
    this.name = "BalanceCheckError";
  }
}

interface GetBalanceParams {
  tokenAddress: EvmAddress;
  ownerAddress: EvmAddress;
  chain: Chain;
}

export async function getEvmTokenBalance({ tokenAddress, ownerAddress, chain }: GetBalanceParams): Promise<Big> {
  try {
    const publicClient = createPublicClient({
      chain,
      transport: http()
    });

    const balanceResult = (await publicClient.readContract({
      abi: erc20ABI,
      address: tokenAddress,
      args: [ownerAddress],
      functionName: "balanceOf"
    })) as string;

    return new Big(balanceResult);
  } catch (err) {
    throw new Error(`Failed to read token balance: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function checkEvmBalancePeriodically(
  tokenAddress: string,
  brlaEvmAddress: string,
  amountDesiredRaw: string,
  intervalMs: number,
  timeoutMs: number,
  chain: Chain
): Promise<Big> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const intervalId = setInterval(async () => {
      try {
        const publicClient = createPublicClient({
          chain,
          transport: http()
        });

        const result = (await publicClient.readContract({
          abi: erc20ABI,
          address: tokenAddress as EvmAddress,
          args: [brlaEvmAddress],
          functionName: "balanceOf"
        })) as string;

        const someBalanceBig = new Big(result);
        const amountDesiredUnitsBig = new Big(amountDesiredRaw);

        if (someBalanceBig.gte(amountDesiredUnitsBig)) {
          clearInterval(intervalId);
          resolve(someBalanceBig);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          reject(new BalanceCheckError(BalanceCheckErrorType.Timeout, `Balance did not meet the limit within ${timeoutMs}ms`));
        }
      } catch (err: unknown) {
        clearInterval(intervalId);
        reject(
          new BalanceCheckError(
            BalanceCheckErrorType.ReadFailure,
            `Error checking balance: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    }, intervalMs);
  });
}
