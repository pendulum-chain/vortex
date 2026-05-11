import Big from "big.js";
import erc20ABI from "../../contracts/ERC20";
import { EvmAddress, EvmNetworks, EvmTokenDetails } from "../../index";
import logger from "../../logger";
import { EvmClientManager } from "../evm/clientManager";

export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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

/**
 * Determines whether an EVM token is a native token (e.g. ETH, MATIC, AVAX)
 * by checking both the `isNative` flag and the well-known sentinel address.
 */
export function isNativeEvmToken(tokenDetails: EvmTokenDetails): boolean {
  return tokenDetails.isNative || tokenDetails.erc20AddressSourceChain.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

interface GetBalanceParams {
  tokenAddress: EvmAddress;
  ownerAddress: EvmAddress;
  chain: EvmNetworks;
}

export async function getEvmTokenBalance({ tokenAddress, ownerAddress, chain }: GetBalanceParams): Promise<Big> {
  try {
    const evmClientManager = EvmClientManager.getInstance();

    const balanceResult = await evmClientManager.readContractWithRetry<string>(chain, {
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

export async function getEvmNativeBalance(ownerAddress: EvmAddress, chain: EvmNetworks): Promise<Big> {
  try {
    const evmClientManager = EvmClientManager.getInstance();
    const balance = await evmClientManager.getBalanceWithRetry(chain, ownerAddress);
    return new Big(balance.toString());
  } catch (err) {
    throw new Error(`Failed to read native balance: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getEvmBalance(params: {
  tokenDetails: EvmTokenDetails;
  ownerAddress: EvmAddress;
  chain: EvmNetworks;
}): Promise<Big> {
  const { tokenDetails, ownerAddress, chain } = params;

  if (isNativeEvmToken(tokenDetails)) {
    return getEvmNativeBalance(ownerAddress, chain);
  }

  return getEvmTokenBalance({
    chain,
    ownerAddress,
    tokenAddress: tokenDetails.erc20AddressSourceChain as EvmAddress
  });
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
        const result = await evmClientManager.readContractWithRetry<string>(chain, {
          abi: erc20ABI,
          address: tokenAddress as EvmAddress,
          args: [brlaEvmAddress],
          functionName: "balanceOf"
        });

        const someBalanceBig = new Big(result);
        const amountDesiredUnitsBig = new Big(amountDesiredRaw);

        logger.current.debug(
          `checkEvmBalancePeriodically: Balance of ${brlaEvmAddress} for token ${tokenAddress} on ${chain}: ${someBalanceBig.toString()} (target: ${amountDesiredRaw})`
        );

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

/**
 * Periodically checks the native token balance of an address until the desired amount is met or the timeout is reached.
 */
export function checkEvmNativeBalancePeriodically(
  ownerAddress: string,
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
        const balance = await evmClientManager.getBalanceWithRetry(chain, ownerAddress as EvmAddress);
        const balanceBig = new Big(balance.toString());
        const amountDesiredUnitsBig = new Big(amountDesiredRaw);

        logger.current.debug(
          `checkEvmNativeBalancePeriodically: Native balance of ${ownerAddress} on ${chain}: ${balanceBig.toString()} (target: ${amountDesiredRaw})`
        );

        if (balanceBig.gte(amountDesiredUnitsBig)) {
          resolve(balanceBig);
        } else if (Date.now() - startTime > timeoutMs) {
          reject(
            new BalanceCheckError(BalanceCheckErrorType.Timeout, `Native balance did not meet the limit within ${timeoutMs}ms`)
          );
        } else {
          // Schedule next check AFTER this one completes to prevent overlapping calls
          setTimeout(checkBalance, intervalMs);
        }
      } catch (err: unknown) {
        reject(
          new BalanceCheckError(
            BalanceCheckErrorType.ReadFailure,
            `Error checking native balance: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    };

    // Start the first check immediately
    checkBalance();
  });
}

/**
 * Unified periodic balance check that automatically handles both native and ERC-20 tokens
 * based on the token details. Callers don't need to know the token type.
 */
export function checkEvmBalanceForToken(params: {
  tokenDetails: EvmTokenDetails;
  ownerAddress: string;
  amountDesiredRaw: string;
  intervalMs: number;
  timeoutMs: number;
  chain: EvmNetworks;
}): Promise<Big> {
  const { tokenDetails, ownerAddress, amountDesiredRaw, intervalMs, timeoutMs, chain } = params;

  if (isNativeEvmToken(tokenDetails)) {
    return checkEvmNativeBalancePeriodically(ownerAddress, amountDesiredRaw, intervalMs, timeoutMs, chain);
  }

  return checkEvmBalancePeriodically(
    tokenDetails.erc20AddressSourceChain,
    ownerAddress,
    amountDesiredRaw,
    intervalMs,
    timeoutMs,
    chain
  );
}
