import Big from 'big.js';
import { Networks } from 'shared';
import { http, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { moonbeam } from 'viem/chains';
import logger from '../../../config/logger';
import {
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS,
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM,
  MOONBEAM_FUNDING_PRIVATE_KEY,
} from '../../../constants/constants';
import erc20ABI from '../../../contracts/ERC20';
import { ApiManager } from '../pendulum/apiManager';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { createMoonbeamClientsAndConfig } from './createServices';

export enum BalanceCheckErrorType {
  Timeout = 'BALANCE_CHECK_TIMEOUT',
  ReadFailure = 'BALANCE_CHECK_READ_FAILURE',
}

export class BalanceCheckError extends Error {
  constructor(
    public readonly type: BalanceCheckErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'BalanceCheckError';
  }
}

export function checkEvmBalancePeriodically(
  tokenAddress: string,
  brlaEvmAddress: string,
  amountDesiredRaw: string,
  intervalMs: number,
  timeoutMs: number,
  chain: any,
): Promise<Big> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const intervalId = setInterval(async () => {
      try {
        const publicClient = createPublicClient({
          chain,
          transport: http(),
        });

        const result = (await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20ABI,
          functionName: 'balanceOf',
          args: [brlaEvmAddress],
        })) as string;

        const someBalanceBig = new Big(result);
        const amountDesiredUnitsBig = new Big(amountDesiredRaw);

        if (someBalanceBig.gte(amountDesiredUnitsBig)) {
          clearInterval(intervalId);
          resolve(someBalanceBig);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          reject(
            new BalanceCheckError(
              BalanceCheckErrorType.Timeout,
              `Balance did not meet the limit within ${timeoutMs}ms`,
            ),
          );
        }
      } catch (err: any) {
        clearInterval(intervalId);
        reject(
          new BalanceCheckError(BalanceCheckErrorType.ReadFailure, `Error checking balance: ${err.message ?? err}`),
        );
      }
    }, intervalMs);
  });
}

export const fundMoonbeamEphemeralAccount = async (ephemeralAddress: string, destinationNetwork: Networks) => {
  try {
    const apiManager = ApiManager.getInstance();
    const apiData = await apiManager.getApi('moonbeam');

    const largeFunding = destinationNetwork === Networks.Ethereum;
    const { walletClient, fundingAmountRaw, publicClient } = getMoonbeamFundingData(apiData.decimals, largeFunding);

    const txHash = await walletClient.sendTransaction({
      to: ephemeralAddress as `0x${string}`,
      value: BigInt(fundingAmountRaw),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt || receipt.status !== 'success') {
      throw new Error(`fundMoonbeamEphemeralAccount: Transaction ${txHash} failed or was not found`);
    }
  } catch (error) {
    console.error('Error during funding Moonbeam ephemeral:', error);
    throw new Error('Error during funding Moonbeam ephemeral: ' + error);
  }
};

export function getMoonbeamFundingData(
  decimals: number,
  largeFunding = false,
): {
  fundingAmountRaw: string;
  walletClient: ReturnType<typeof createMoonbeamClientsAndConfig>['walletClient'];
  publicClient: ReturnType<typeof createMoonbeamClientsAndConfig>['publicClient'];
} {
  const fundingAmountUnits = largeFunding
    ? Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM)
    : Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, decimals).toFixed();

  const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
  const { walletClient, publicClient } = createMoonbeamClientsAndConfig(moonbeamExecutorAccount);

  return { fundingAmountRaw, walletClient, publicClient };
}
