import Big from "big.js";
import { Horizon } from "stellar-sdk";
import logger from "../../../../config/logger";
import { HORIZON_URL } from "../../../../constants/constants";
import RampState from "../../../../models/rampState.model";
import { StateMetadata } from "../meta-state-types";

/**
 * Verifies if a stellar payment was successful by checking if the tokens
 * are still present in the ephemeral account
 */
export async function verifyStellarPaymentSuccess(state: RampState): Promise<boolean> {
  const stateMetadata = state.state as StateMetadata;

  if (!stateMetadata.stellarEphemeralAccountId) {
    throw new Error("Stellar ephemeral account ID not found in state metadata");
  }

  if (!stateMetadata.stellarTarget) {
    throw new Error("Stellar target information not found in state metadata");
  }

  if (!stateMetadata.outputAmountBeforeFinalStep) {
    throw new Error("Output amount information not found in state metadata");
  }

  const { stellarEphemeralAccountId, stellarTarget, outputAmountBeforeFinalStep } = stateMetadata;
  const { stellarTokenDetails } = stellarTarget;
  const expectedPaymentAmount = new Big(outputAmountBeforeFinalStep.units);

  try {
    logger.info(
      `Verifying stellar payment success for account ${stellarEphemeralAccountId}, ` +
        `asset ${stellarTokenDetails.stellarAsset.code.string}, ` +
        `expected payment amount: ${expectedPaymentAmount.toString()}`
    );

    const currentBalance = await getStellarTokenBalance(
      stellarEphemeralAccountId,
      stellarTokenDetails.stellarAsset.code.string,
      stellarTokenDetails.stellarAsset.issuer.stellarEncoding
    );

    logger.info(`Current balance: ${currentBalance.toString()}, expected payment: ${expectedPaymentAmount.toString()}`);

    // For Stellar payment operations, the transaction either succeeds completely or fails completely.
    // If the payment succeeded, ALL tokens should have been transferred, leaving exactly 0 balance.
    // Any remaining balance indicates the payment did not complete successfully.
    if (currentBalance.eq(0)) {
      logger.info(
        `Payment succeeded: current balance is exactly 0, all ${expectedPaymentAmount.toString()} tokens were transferred`
      );
      return true; // Payment succeeded - no tokens left
    } else {
      logger.warn(
        `Payment failed: ${currentBalance.toString()} tokens still remain on account ` +
          `(expected all ${expectedPaymentAmount.toString()} tokens to be transferred)`
      );
      return false; // Payment failed - tokens still present
    }
  } catch (error) {
    logger.error(`Error verifying stellar payment success: ${error}`);
    throw new Error(`Failed to verify stellar payment success: ${error}`);
  }
}

/**
 * Gets the balance of a specific token for a Stellar account
 */
async function getStellarTokenBalance(accountId: string, assetCode: string, assetIssuer: string): Promise<Big> {
  try {
    const server = new Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(accountId);

    const assetBalance = account.balances.find(balance => {
      if (balance.asset_type === "credit_alphanum4" || balance.asset_type === "credit_alphanum12") {
        return balance.asset_code === assetCode && balance.asset_issuer === assetIssuer;
      }
      return false;
    });

    if (!assetBalance) {
      logger.warn(`Asset ${assetCode} not found in account ${accountId} balances`);
      return new Big(0);
    }

    return new Big(assetBalance.balance);
  } catch (error) {
    logger.error(`Error getting stellar token balance for account ${accountId}: ${error}`);
    throw error;
  }
}
