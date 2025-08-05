import {
  ApiManager,
  PendulumFundEphemeralErrorResponse,
  PendulumFundEphemeralRequest,
  PendulumFundEphemeralResponse,
  StellarTokenConfig,
  TOKEN_CONFIG,
  XCMTokenConfig
} from "@packages/shared";
import { AccountInfo } from "@polkadot/types/interfaces";
import Big from "big.js";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import {
  PENDULUM_FUNDING_AMOUNT_UNITS,
  PENDULUM_GLMR_FUNDING_AMOUNT_UNITS,
  SUBSIDY_MINIMUM_RATIO_FUND_UNITS
} from "../../constants/constants";
import { ChainDecimals, multiplyByPowerOfTen, nativeToDecimal } from "../services/pendulum/helpers";
import { fundEphemeralAccount, getFundingData } from "../services/pendulum/pendulum.service";
import { SlackNotifier } from "../services/slack.service";

// DEPRECATED
export const fundEphemeralAccountController = async (
  req: Request<unknown, unknown, PendulumFundEphemeralRequest>,
  res: Response<PendulumFundEphemeralResponse | PendulumFundEphemeralErrorResponse>
) => {
  const { ephemeralAddress, requiresGlmr } = req.body;
  const networkName = "pendulum";

  if (!ephemeralAddress) {
    res.status(httpStatus.BAD_REQUEST).send({ error: "Invalid request parameters" });
    return;
  }

  try {
    const result = await fundEphemeralAccount(networkName, ephemeralAddress, Boolean(requiresGlmr));
    if (result) {
      res.json({ data: undefined, status: "success" });
      return;
    }
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ error: "Funding error" });
    return;
  } catch (error) {
    console.error("Error funding ephemeral account:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ error: "Internal Server Error" });
  }
};

interface StatusResponse {
  status: boolean;
  public: string;
}

export const sendStatusWithPk = async (): Promise<StatusResponse> => {
  const slackNotifier = new SlackNotifier();
  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const apiData = await apiManager.getApi(networkName);
  const { fundingAccountKeypair } = getFundingData(apiData.ss58Format, apiData.decimals);
  const { data: balance } = (await apiData.api.query.system.account(fundingAccountKeypair.address)) as AccountInfo;

  let isTokensSufficient = true;
  // TODO we may want to add a cached response to this function. No need to check on every requests.

  // Wait for all required token balances check.
  await Promise.all(
    Object.entries(TOKEN_CONFIG).map(async ([token, tokenConfig]: [string, StellarTokenConfig | XCMTokenConfig]) => {
      logger.info(`Checking token ${token} balance...`);
      if (!tokenConfig.pendulumCurrencyId) {
        throw new Error(`Token ${token} does not have a currency id.`);
      }
      if (tokenConfig.maximumSubsidyAmountRaw === "0") {
        return;
      }

      const tokenBalanceResponse = await apiData.api.query.tokens.accounts(
        fundingAccountKeypair.address,
        tokenConfig.pendulumCurrencyId
      );

      const tokenData = tokenBalanceResponse.toHuman() as {
        free: string;
        reserved: string;
        frozen: string;
      };
      const tokenBalance = Big(tokenData.free.replaceAll(",", "") ?? "0");
      const maximumSubsidyAmountRaw = Big(tokenConfig.maximumSubsidyAmountRaw);
      const remainingMaxSubsidiesAvailable = tokenBalance.div(maximumSubsidyAmountRaw);

      if (remainingMaxSubsidiesAvailable.lt(SUBSIDY_MINIMUM_RATIO_FUND_UNITS)) {
        isTokensSufficient = false;
        logger.info(`Token ${token} balance is insufficient.`);

        const tokenDecimals = "decimals" in tokenConfig ? tokenConfig.decimals : ChainDecimals;
        slackNotifier.sendMessage({
          text: `Current balance of funding account is ${nativeToDecimal(
            tokenBalance,
            tokenDecimals
          ).toString()} ${token} please charge the account ${fundingAccountKeypair.address}.`
        });
      }
    })
  );

  const minimumBalanceFundingAccount = multiplyByPowerOfTen(Big(PENDULUM_FUNDING_AMOUNT_UNITS), apiData.decimals);
  const minimumGlmrBalanceFundingAccount = multiplyByPowerOfTen(
    Big(PENDULUM_GLMR_FUNDING_AMOUNT_UNITS),
    TOKEN_CONFIG.glmr.decimals
  );

  const nativeBalance = Big(balance?.free?.toString() ?? "0");
  const glmrBalanceResponse = await apiData.api.query.tokens.accounts(
    fundingAccountKeypair.address,
    TOKEN_CONFIG.glmr.pendulumCurrencyId
  );
  const glmrData = glmrBalanceResponse.toHuman() as {
    free: string;
    reserved: string;
    frozen: string;
  };
  const glmrBalance = Big(glmrData.free.replaceAll(",", "") ?? "0");

  if (
    nativeBalance.gte(minimumBalanceFundingAccount) &&
    glmrBalance.gte(minimumGlmrBalanceFundingAccount) &&
    isTokensSufficient
  ) {
    return { public: fundingAccountKeypair.address, status: true };
  }
  if (nativeBalance.lt(minimumBalanceFundingAccount) || glmrBalance.lt(minimumGlmrBalanceFundingAccount)) {
    slackNotifier.sendMessage({
      text: `Current balance of funding account is ${nativeToDecimal(nativeBalance).toString()} PEN and ${nativeToDecimal(
        glmrBalance,
        TOKEN_CONFIG.glmr.decimals
      ).toString()} GLMR, please charge the account ${fundingAccountKeypair.address}.`
    });
  }
  return { public: fundingAccountKeypair.address, status: false };
};
