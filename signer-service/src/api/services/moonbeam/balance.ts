import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import erc20ABI from '../../../contracts/ERC20';
import Big from 'big.js';
import { ApiManager } from '../pendulum/apiManager';
import { getFundingData } from '../pendulum/pendulum.service';
import { KeyringPair } from '@polkadot/keyring/types';
import { Keyring } from '@polkadot/api';
import { MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS, MOONBEAM_FUNDING_SEED } from '../../../constants/constants';
import { multiplyByPowerOfTen } from '../pendulum/helpers';

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

export const fundMoonbeamEphemeralAccount = async (ephemeralAddress: string) => {
  try {
    const apiManager = ApiManager.getInstance();
    const apiData = await apiManager.getApi('moonbeam');
    const { fundingAccountKeypair, fundingAmountRaw } = getMoonbeamFundingData(apiData.ss58Format, apiData.decimals);

    await apiManager.executeApiCall(
      (api) => api.tx.balances.transferKeepAlive(ephemeralAddress, fundingAmountRaw),
      fundingAccountKeypair,
      'moonbeam',
    );
  } catch (error) {
    console.error('Error during funding Moonbeam ephemeral:', error);
    return false;
  }
};

export function getMoonbeamFundingData(
  ss58Format: number,
  decimals: number,
): {
  fundingAccountKeypair: KeyringPair;
  fundingAmountRaw: string;
} {
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const fundingAccountKeypair = keyring.addFromUri(MOONBEAM_FUNDING_SEED || '');
  const fundingAmountUnits = Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, decimals).toFixed();

  return { fundingAccountKeypair, fundingAmountRaw };
}
