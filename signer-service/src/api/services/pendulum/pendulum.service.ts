import { Keyring } from '@polkadot/api';
import Big from 'big.js';
import { PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../../constants/constants';
import { KeyringPair } from '@polkadot/keyring/types';
import dotenv from 'dotenv';
import { multiplyByPowerOfTen } from './helpers';
import { apiManager } from '../../..';
import { GLMR_FUNDING_AMOUNT_RAW } from '../../../constants/constants';
import { TOKEN_CONFIG } from '../../../constants/tokenConfig';
dotenv.config();

const PENDULUM_FUNDING_SEED = process.env.PENDULUM_FUNDING_SEED;

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

export const fundEphemeralAccount = async (ephemeralAddress: string, requiresGlmr?: boolean): Promise<boolean> => {
  try {
    const apiData = await apiManager.getApi();
    const { fundingAccountKeypair, fundingAmountRaw } = getFundingData(apiData.ss58Format, apiData.decimals);

    if (requiresGlmr) {
      const { fundingAccountKeypair } = getFundingData(apiData.ss58Format, apiData.decimals);
      const pendulumCurrencyId = TOKEN_CONFIG.glmr.pendulumCurrencyId;

      const penFundingTx = apiData.api.tx.balances.transferKeepAlive(ephemeralAddress, fundingAmountRaw);
      const glmrFundingTx = apiData.api.tx.tokens.transfer(
        ephemeralAddress,
        pendulumCurrencyId,
        GLMR_FUNDING_AMOUNT_RAW,
      );

      await apiManager.executeApiCall(
        (api) => api.tx.utility.batchAll([penFundingTx, glmrFundingTx]),
        fundingAccountKeypair,
      );
    } else {
      await apiManager.executeApiCall(
        (api) => api.tx.balances.transferKeepAlive(ephemeralAddress, fundingAmountRaw),
        fundingAccountKeypair,
      );
    }

    return true;
  } catch (error) {
    console.error('Error during funding:', error);
    return false;
  }
};
