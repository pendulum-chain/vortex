import Big from "big.js";
import erc20ABI from "../../contracts/ERC20";
import { EvmAddress, EvmNetworks } from "../../index";
import { EvmClientManager } from "../evm/clientManager";

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
  chain: EvmNetworks;
}

export async function getEvmTokenBalance({ tokenAddress, ownerAddress, chain }: GetBalanceParams): Promise<Big> {
  try {
    const evmClientManager = EvmClientManager.getInstance();

    const balanceResult = await evmClientManager.readContract<string>(chain, {
      abi: erc20ABI,
      address: tokenAddress,
      args: [ownerAddress],
      functionName: "balanceOf"
    });

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
  chain: EvmNetworks
): Promise<Big> {
  const evmClientManager = EvmClientManager.getInstance();

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkBalance = async () => {
      try {
        const result = await evmClientManager.readContract<string>(chain, {
          abi: erc20ABI,
          address: tokenAddress as EvmAddress,
          args: [brlaEvmAddress],
          functionName: "balanceOf"
        });

        const someBalanceBig = new Big(result);
        const amountDesiredUnitsBig = new Big(amountDesiredRaw);

        if (someBalanceBig.gte(amountDesiredUnitsBig)) {
          resolve(someBalanceBig);
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new BalanceCheckError(BalanceCheckErrorType.Timeout, `Balance did not meet the limit within ${timeoutMs}ms`));
        } else {
          // Schedule next check AFTER this one completes to prevent overlapping calls
          setTimeout(checkBalance, intervalMs);
        }
      } catch (err: unknown) {
        reject(
          new BalanceCheckError(
            BalanceCheckErrorType.ReadFailure,
            `Error checking balance: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    };

    // Start the first check immediately
    checkBalance();
  });
}
