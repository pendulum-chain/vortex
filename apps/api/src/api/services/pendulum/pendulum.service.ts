import { TOKEN_CONFIG } from '@packages/shared';
import { Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import Big from 'big.js';
import { GLMR_FUNDING_AMOUNT_RAW, PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../../constants/constants';
import { ApiManager, SubstrateApiNetwork } from './apiManager';
import { multiplyByPowerOfTen } from './helpers';

const { PENDULUM_FUNDING_SEED } = process.env;

export function getFundingData(
  ss58Format: number,
  decimals: number,
): {
  fundingAccountKeypair: KeyringPair;
  fundingAmountRaw: string;
} {
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const fundingAccountKeypair = keyring.addFromUri(PENDULUM_FUNDING_SEED || '');
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, decimals).toFixed();

  return { fundingAccountKeypair, fundingAmountRaw };
}

export const fundEphemeralAccount = async (
  networkName: SubstrateApiNetwork,
  ephemeralAddress: string,
  requiresGlmr?: boolean,
): Promise<boolean> => {
  try {
    const apiManager = ApiManager.getInstance();
    const apiData = await apiManager.getApi(networkName);
    const { fundingAccountKeypair, fundingAmountRaw } = getFundingData(apiData.ss58Format, apiData.decimals);

    if (requiresGlmr) {
      const { fundingAccountKeypair } = getFundingData(apiData.ss58Format, apiData.decimals);
      const { pendulumCurrencyId } = TOKEN_CONFIG.glmr;

      const penFundingTx = apiData.api.tx.balances.transferKeepAlive(ephemeralAddress, fundingAmountRaw);
      const glmrFundingTx = apiData.api.tx.tokens.transfer(
        ephemeralAddress,
        pendulumCurrencyId,
        GLMR_FUNDING_AMOUNT_RAW,
      );

      await apiManager.executeApiCall(
        (api) => api.tx.utility.batchAll([penFundingTx, glmrFundingTx]),
        fundingAccountKeypair,
        networkName,
      );
    } else {
      await apiManager.executeApiCall(
        (api) => api.tx.balances.transferKeepAlive(ephemeralAddress, fundingAmountRaw),
        fundingAccountKeypair,
        networkName,
      );
    }

    return true;
  } catch (error) {
    console.error('Error during funding:', error);
    return false;
  }
};
