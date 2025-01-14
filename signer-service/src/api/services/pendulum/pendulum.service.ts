import { Keyring } from '@polkadot/api';
import Big from 'big.js';
import {
  PENDULUM_FUNDING_AMOUNT_UNITS,
  SUBSIDY_MINIMUM_RATIO_FUND_UNITS,
  PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS,
} from '../../../constants/constants';
import { StellarTokenConfig, TOKEN_CONFIG, XCMTokenConfig } from '../../../constants/tokenConfig';
import { SlackNotifier } from '../../services/slack.service';
import { KeyringPair } from '@polkadot/keyring/types';
import { AccountInfo } from '@polkadot/types/interfaces';

import dotenv from 'dotenv';
import { multiplyByPowerOfTen, nativeToDecimal } from './helpers';
import { createPolkadotApi } from './createPolkadotApi';
dotenv.config();

const PENDULUM_FUNDING_SEED = process.env.PENDULUM_FUNDING_SEED;

function getFundingData(
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

export const fundEphemeralAccount = async (ephemeralAddress: string): Promise<boolean> => {
  try {
    const apiData = await createPolkadotApi();
    const { fundingAccountKeypair, fundingAmountRaw } = getFundingData(apiData.ss58Format, apiData.decimals);

    await apiData.api.tx.balances.transfer(ephemeralAddress, fundingAmountRaw).signAndSend(fundingAccountKeypair);

    return true;
  } catch (error) {
    console.error('Error during funding:', error);
    return false;
  }
};

interface StatusResponse {
  status: boolean;
  public: string;
}

export const sendStatusWithPk = async (): Promise<StatusResponse> => {
  const slackNotifier = new SlackNotifier();
  const apiData = await createPolkadotApi();
  const { fundingAccountKeypair } = getFundingData(apiData.ss58Format, apiData.decimals);
  const { data: balance } = (await apiData.api.query.system.account(fundingAccountKeypair.address)) as AccountInfo;

  let isTokensSufficient = true;

  // Wait for all required token balances check.
  await Promise.all(
    Object.entries(TOKEN_CONFIG).map(async ([token, tokenConfig]: [string, StellarTokenConfig | XCMTokenConfig]) => {
      console.log(`Checking token ${token} balance...`);
      if (!tokenConfig.pendulumCurrencyId) {
        throw new Error(`Token ${token} does not have a currency id.`);
      }

      const tokenBalanceResponse = await apiData.api.query.tokens.accounts(
        fundingAccountKeypair.address,
        tokenConfig.pendulumCurrencyId,
      );

      const tokenBalance = Big(tokenBalanceResponse?.free?.toString() ?? '0');
      const maximumSubsidyAmountRaw = Big(tokenConfig.maximumSubsidyAmountRaw);
      const remainingMaxSubsidiesAvailable = tokenBalance.div(maximumSubsidyAmountRaw);

      if (remainingMaxSubsidiesAvailable.lt(SUBSIDY_MINIMUM_RATIO_FUND_UNITS)) {
        isTokensSufficient = false;
        console.log(`Token ${token} balance is insufficient.`);

        slackNotifier.sendMessage({
          text: `Current balance of funding account is ${nativeToDecimal(
            tokenBalance,
          ).toString()} ${token} please charge the account ${fundingAccountKeypair.address}.`,
        });
      }
    }),
  );

  const minimumBalanceFundingAccount = multiplyByPowerOfTen(Big(PENDULUM_FUNDING_AMOUNT_UNITS), apiData.decimals);
  const nativeBalance = Big(balance?.free?.toString() ?? '0');

  if (nativeBalance.gte(minimumBalanceFundingAccount) && isTokensSufficient) {
    return { status: true, public: fundingAccountKeypair.address };
  }
  if (nativeBalance.lt(minimumBalanceFundingAccount)) {
    slackNotifier.sendMessage({
      text: `Current balance of funding account is ${nativeToDecimal(
        nativeBalance,
      ).toString()} PEN please charge the account ${fundingAccountKeypair.address}.`,
    });
  }
  return { status: false, public: fundingAccountKeypair.address };
};
