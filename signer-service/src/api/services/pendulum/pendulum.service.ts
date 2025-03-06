import { Keyring } from '@polkadot/api';
import Big from 'big.js';
import { PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../../constants/constants';
import { KeyringPair } from '@polkadot/keyring/types';

import dotenv from 'dotenv';
import { multiplyByPowerOfTen } from './helpers';
import { createPolkadotApi } from './createPolkadotApi';
import { GLMR_FUNDING_AMOUNT_RAW } from '../../../constants/constants';
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
    const apiData = await createPolkadotApi();
    const { fundingAccountKeypair, fundingAmountRaw } = getFundingData(apiData.ss58Format, apiData.decimals);

    if (requiresGlmr) {
      const { fundingAccountKeypair } = getFundingData(apiData.ss58Format, apiData.decimals);
      const pendulumCurrencyId = { XCM: 6 }; // GLMR

      const penFundingTx = apiData.api.tx.balances.transferKeepAlive(ephemeralAddress, fundingAmountRaw);
      const glmrFundingTx = apiData.api.tx.tokens.transfer(
        ephemeralAddress,
        pendulumCurrencyId,
        GLMR_FUNDING_AMOUNT_RAW,
      );

      const batch = apiData.api.tx.utility.batch([penFundingTx, glmrFundingTx]);
      await batch.signAndSend(fundingAccountKeypair);
    } else {
      await apiData.api.tx.balances
        .transferKeepAlive(ephemeralAddress, fundingAmountRaw)
        .signAndSend(fundingAccountKeypair);
    }

    return true;
  } catch (error) {
    console.error('Error during funding:', error);
    return false;
  }
};
