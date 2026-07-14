import Big from "big.js";
import erc20ABI from "../../contracts/ERC20";
import { sleep } from "../../helpers/functions";
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

export async function checkEvmBalancePeriodically(
  tokenAddress: string,
  brlaEvmAddress: string,
  amountDesiredRaw: string,
  intervalMs: number,
  timeoutMs: number,
  chain: EvmNetworks,
  signal?: AbortSignal
): Promise<Big> {
  const evmClientManager = EvmClientManager.getInstance();
  const startTime = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Balance check aborted");
    }

    let someBalanceBig: Big;
    let amountDesiredUnitsBig: Big;
    try {
      const result = await evmClientManager.readContractWithRetry<string>(chain, {
        abi: erc20ABI,
        address: tokenAddress as EvmAddress,
        args: [brlaEvmAddress],
        functionName: "balanceOf"
      });

      someBalanceBig = new Big(result);
      amountDesiredUnitsBig = new Big(amountDesiredRaw);
    } catch (err: unknown) {
      throw new BalanceCheckError(
        BalanceCheckErrorType.ReadFailure,
        `Error checking balance: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    logger.current.debug(
      `checkEvmBalancePeriodically: Balance of ${brlaEvmAddress} for token ${tokenAddress} on ${chain}: ${someBalanceBig.toString()} (target: ${amountDesiredRaw})`
    );

    if (someBalanceBig.gte(amountDesiredUnitsBig)) {
      return someBalanceBig;
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new BalanceCheckError(BalanceCheckErrorType.Timeout, `Balance did not meet the limit within ${timeoutMs}ms`);
    }
    // Sleep AFTER each check completes to prevent overlapping calls
    await sleep(intervalMs, signal);
  }
}

/**
 * Periodically checks the native token balance of an address until the desired amount is met or the timeout is reached.
 */
export async function checkEvmNativeBalancePeriodically(
  ownerAddress: string,
  amountDesiredRaw: string,
  intervalMs: number,
  timeoutMs: number,
  chain: EvmNetworks,
  signal?: AbortSignal
): Promise<Big> {
  const evmClientManager = EvmClientManager.getInstance();
  const startTime = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Balance check aborted");
    }

    let balanceBig: Big;
    let amountDesiredUnitsBig: Big;
    try {
      const balance = await evmClientManager.getBalanceWithRetry(chain, ownerAddress as EvmAddress);
      balanceBig = new Big(balance.toString());
      amountDesiredUnitsBig = new Big(amountDesiredRaw);
    } catch (err: unknown) {
      throw new BalanceCheckError(
        BalanceCheckErrorType.ReadFailure,
        `Error checking native balance: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    logger.current.debug(
      `checkEvmNativeBalancePeriodically: Native balance of ${ownerAddress} on ${chain}: ${balanceBig.toString()} (target: ${amountDesiredRaw})`
    );

    if (balanceBig.gte(amountDesiredUnitsBig)) {
      return balanceBig;
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new BalanceCheckError(BalanceCheckErrorType.Timeout, `Native balance did not meet the limit within ${timeoutMs}ms`);
    }
    // Sleep AFTER each check completes to prevent overlapping calls
    await sleep(intervalMs, signal);
  }
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
  signal?: AbortSignal;
}): Promise<Big> {
  const { tokenDetails, ownerAddress, amountDesiredRaw, intervalMs, timeoutMs, chain, signal } = params;

  if (isNativeEvmToken(tokenDetails)) {
    return checkEvmNativeBalancePeriodically(ownerAddress, amountDesiredRaw, intervalMs, timeoutMs, chain, signal);
  }

  return checkEvmBalancePeriodically(
    tokenDetails.erc20AddressSourceChain,
    ownerAddress,
    amountDesiredRaw,
    intervalMs,
    timeoutMs,
    chain,
    signal
  );
}
