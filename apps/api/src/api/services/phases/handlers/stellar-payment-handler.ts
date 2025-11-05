import { HORIZON_URL, RampPhase } from "@vortexfi/shared";
import { Horizon, NetworkError, Networks, Transaction } from "stellar-sdk";
import logger from "../../../../config/logger";
import { SANDBOX_ENABLED } from "../../../../constants/constants";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { verifyStellarPaymentSuccess } from "../helpers/stellar-payment-verifier";
import { isStellarNetworkError } from "./fund-ephemeral-handler";

const NETWORK_PASSPHRASE = SANDBOX_ENABLED ? Networks.TESTNET : Networks.PUBLIC;

const horizonServer = new Horizon.Server(HORIZON_URL);

export class StellarPaymentPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "stellarPayment";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { txData: offrampingTransactionXDR } = this.getPresignedTransaction(state, "stellarPayment");
    if (typeof offrampingTransactionXDR !== "string") {
      throw new Error("Invalid transaction data");
    }

    try {
      const offrampingTransaction = new Transaction(offrampingTransactionXDR, NETWORK_PASSPHRASE);
      await horizonServer.submitTransaction(offrampingTransaction);

      return this.transitionToNextPhase(state, "complete");
    } catch (e) {
      const horizonError = e as NetworkError;

      if (isStellarNetworkError(horizonError) && horizonError.response.data?.status === 400) {
        logger.error(
          `Could not submit the offramp transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`
        );
        // check https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/transactions
        if (horizonError.response.data.extras.result_codes.transaction === "tx_bad_seq") {
          logger.info("tx_bad_seq error detected. Verifying if payment was actually successful...");

          try {
            const paymentSuccessful = await verifyStellarPaymentSuccess(state);

            if (paymentSuccessful) {
              logger.info(
                "Payment verification confirmed: all tokens transferred from ephemeral account. Proceeding to complete."
              );
              return this.transitionToNextPhase(state, "complete");
            } else {
              logger.error(
                "Payment verification failed: tokens are still present in ephemeral account. Payment did not succeed."
              );
              throw new Error("Stellar payment failed - tokens still present in ephemeral account despite tx_bad_seq error");
            }
          } catch (verificationError) {
            logger.error(`Failed to verify payment success: ${verificationError}`);
            throw new Error(`Could not verify stellar payment success: ${verificationError}`);
          }
        }

        console.error(horizonError.response.data.extras);
        throw new Error("Could not submit the offramping transaction");
      } else {
        console.error("Error while submitting the offramp transaction", e);
        throw new Error("Could not submit the offramping transaction");
      }
    }
  }
}

export default new StellarPaymentPhaseHandler();
