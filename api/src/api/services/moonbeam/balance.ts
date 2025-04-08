import { createPublicClient, http } from 'viem';
import { moonbeam, polygon } from 'viem/chains';
import erc20ABI from '../../../contracts/ERC20';
import Big from 'big.js';
import { ApiManager } from '../pendulum/apiManager';
import { getFundingData } from '../pendulum/pendulum.service';
import { KeyringPair } from '@polkadot/keyring/types';
import { Keyring } from '@polkadot/api';
import { MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS, MOONBEAM_FUNDING_SEED } from '../../../constants/constants';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { privateKeyToAccount } from 'viem/accounts';
import { createMoonbeamClientsAndConfig } from './createServices';

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
          chain: moonbeam,
          transport: http(),
        });

        const result = (await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20ABI,
          functionName: 'balanceOf',
          args: [brlaEvmAddress],
        })) as string;

        console.log(`Moonbeam balance check: ${result.toString()} / ${amountDesiredRaw.toString()}`);
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

export const fundMoonbeamEphemeralAccount = async (ephemeralAddress: string) => {
  try {
    const apiManager = ApiManager.getInstance();
    const apiData = await apiManager.getApi('moonbeam');
    const { walletClient, fundingAmountRaw, publicClient } = getMoonbeamFundingData(apiData.decimals);

    const txHash = await walletClient.sendTransaction({
      to: ephemeralAddress as `0x${string}`,
      value: BigInt(fundingAmountRaw),
    });
    // wait 30 seconds.
    await new Promise((resolve) => setTimeout(resolve, 30000)); // TODO needs to be improved.

    // TODO investigate why this is failing even though the funding works.
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt || receipt.status === 'success') {
      throw new Error(`fundMoonbeamEphemeralAccount: Transaction ${txHash} failed or was not found`);
    }
  } catch (error) {
    console.error('Error during funding Moonbeam ephemeral:', error);
    throw new Error('Error during funding Moonbeam ephemeral: ' + error);
  }
};

export function getMoonbeamFundingData(decimals: number): {
  fundingAmountRaw: string;
  walletClient: ReturnType<typeof createMoonbeamClientsAndConfig>['walletClient'];
  publicClient: ReturnType<typeof createMoonbeamClientsAndConfig>['publicClient'];
} {
  const fundingAmountUnits = Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, decimals).toFixed();

  const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_SEED as `0x${string}`);
  const { walletClient, publicClient } = createMoonbeamClientsAndConfig(moonbeamExecutorAccount);

  return { fundingAmountRaw, walletClient, publicClient };
}
