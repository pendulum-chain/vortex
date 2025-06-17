import { Keyring } from "@polkadot/api";
import Big from "big.js";
import { Request, Response } from "express";
import httpStatus from "http-status";

import {
  StellarTokenConfig,
  SubsidizeErrorResponse,
  SubsidizePostSwapRequest,
  SubsidizePostSwapResponse,
  SubsidizePreSwapRequest,
  SubsidizePreSwapResponse,
  TOKEN_CONFIG,
  XCMTokenConfig
} from "@packages/shared";
import {} from "@packages/shared";
import logger from "../../config/logger";
import { PENDULUM_FUNDING_SEED } from "../../constants/constants";
import { ApiManager } from "../services/pendulum/apiManager";

export const getFundingAccount = () => {
  if (!PENDULUM_FUNDING_SEED) {
    throw new Error("PENDULUM_FUNDING_SEED is not configured");
  }

  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(PENDULUM_FUNDING_SEED);
};

const validateSubsidyAmount = (amount: string, maxAmount: string) => {
  if (Big(amount).gt(Big(maxAmount))) {
    throw new Error("Amount exceeds maximum subsidy amount");
  }
};

const getPendulumCurrencyConfig = (token: string): StellarTokenConfig | XCMTokenConfig => {
  const normalizedToken = token.toLowerCase() as keyof typeof TOKEN_CONFIG;
  const config = TOKEN_CONFIG[normalizedToken];

  if (!config) {
    throw new Error(`Unsupported token: ${token}`);
  }

  return config;
};

export const subsidizePreSwap = async (
  req: Request<unknown, unknown, SubsidizePreSwapRequest>,
  res: Response<SubsidizePreSwapResponse | SubsidizeErrorResponse>
): Promise<void> => {
  try {
    const { address, amountRaw, tokenToSubsidize } = req.body;
    logger.info("Subsidize pre swap", address, amountRaw, tokenToSubsidize);

    const config = getPendulumCurrencyConfig(tokenToSubsidize);

    validateSubsidyAmount(amountRaw, config.maximumSubsidyAmountRaw);

    const fundingAccountKeypair = getFundingAccount();

    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    await apiManager.executeApiCall(
      api => api.tx.tokens.transfer(address, config.pendulumCurrencyId, amountRaw),
      fundingAccountKeypair,
      networkName
    );

    res.json({ message: "Subsidy transferred successfully" });
    return;
  } catch (error) {
    console.error("Error in subsidizePreSwap::", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const subsidizePostSwap = async (
  req: Request<unknown, unknown, SubsidizePostSwapRequest>,
  res: Response<SubsidizePostSwapResponse | SubsidizeErrorResponse>
): Promise<void> => {
  try {
    const { address, amountRaw, token } = req.body;
    logger.info("Subsidize post swap", address, amountRaw, token);

    const config = getPendulumCurrencyConfig(token);

    validateSubsidyAmount(amountRaw, config.maximumSubsidyAmountRaw);

    const fundingAccountKeypair = getFundingAccount();

    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const apiInstance = await apiManager.getApi(networkName);
    await apiInstance.api.tx.tokens.transfer(address, config.pendulumCurrencyId, amountRaw).signAndSend(fundingAccountKeypair);

    res.json({ message: "Subsidy transferred successfully" });
    return;
  } catch (error) {
    console.error("Error in subsidizePostSwap::", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
