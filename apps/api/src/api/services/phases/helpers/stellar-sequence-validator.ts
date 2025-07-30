import { Horizon } from "stellar-sdk";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { horizonServer } from "../handlers/helpers";

/**
 * Validates that the stellarPayment transaction can execute by comparing
 * the expected sequence number with the current ephemeral account sequence number
 */
export async function validateStellarPaymentSequenceNumber(state: RampState, stellarEphemeralAccountId: string): Promise<void> {
  try {
    const stellarPaymentTx = state.presignedTxs?.find(tx => tx.phase === "stellarPayment");

    if (!stellarPaymentTx?.meta?.expectedSequenceNumber) {
      throw new Error("Expected sequence number not found in stellarPayment transaction metadata");
    }

    const expectedSequenceNumber = stellarPaymentTx.meta.expectedSequenceNumber as string;

    let currentAccount: Horizon.AccountResponse;
    try {
      currentAccount = await horizonServer.loadAccount(stellarEphemeralAccountId);
    } catch (error) {
      throw new Error(`Failed to load Stellar ephemeral account ${stellarEphemeralAccountId}: ${error}`);
    }

    const currentSequenceNumber = currentAccount.sequenceNumber();

    logger.info(
      `Validating sequence numbers for ephemeral account ${stellarEphemeralAccountId}: ` +
        `expected=${expectedSequenceNumber}, current=${currentSequenceNumber}`
    );

    const expectedBigInt = BigInt(expectedSequenceNumber);
    const currentBigInt = BigInt(currentSequenceNumber);

    if (expectedBigInt <= currentBigInt) {
      throw new Error(
        `Stellar payment transaction sequence validation failed: expected sequence number ${expectedSequenceNumber} is not greater than the current account sequence number ${currentSequenceNumber}. The stellarPayment transaction may not be able to execute.`
      );
    }
  } catch (error) {
    logger.error(`Stellar payment sequence number validation failed: ${error}`);
    throw error;
  }
}
