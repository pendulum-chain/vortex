import Big from 'big.js';
import { AccountInfo } from '@polkadot/types/interfaces';
import { Request, Response, NextFunction } from 'express';

import { PENDULUM_FUNDING_AMOUNT_UNITS, SUBSIDY_MINIMUM_RATIO_FUND_UNITS } from '../../constants/constants';
import { StellarTokenConfig, TOKEN_CONFIG, XCMTokenConfig } from '../../constants/tokenConfig';
import { createPolkadotApi } from '../services/pendulum/createPolkadotApi';
import { fundEphemeralAccount, getFundingData } from '../services/pendulum/pendulum.service';
import { multiplyByPowerOfTen, nativeToDecimal } from '../services/pendulum/helpers';
import { SlackNotifier } from '../services/slack.service';

interface FundEphemeralRequest {
  ephemeralAddress: string;
}

type ApiResponse<T> =
  | {
      status: 'success';
      data: T;
    }
  | {
      error: string;
      details?: string;
    };

export const fundEphemeralAccountController = async (
  req: Request<{}, {}, FundEphemeralRequest>,
  res: Response<ApiResponse<void>>,
) => {
  const { ephemeralAddress } = req.body;

  if (!ephemeralAddress) {
    res.status(400).send({ error: 'Invalid request parameters' });
    return;
  }

  try {
    const result = await fundEphemeralAccount(ephemeralAddress);
    if (result) {
      res.json({ status: 'success', data: undefined });
      return;
    } else {
      res.status(500).send({ error: 'Funding error' });
      return;
    }
  } catch (error) {
    console.error('Error funding ephemeral account:', error);
    res.status(500).send({ error: 'Internal Server Error' });
    return;
  }
};

export const sendStatusWithPkController = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const result = await sendStatusWithPk();
    res.json(result);
    return;
  } catch (err) {
    const error = err as Error;
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
    return;
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
