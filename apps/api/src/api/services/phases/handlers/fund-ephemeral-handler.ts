import { ApiManager, FiatToken, getNetworkFromDestination, RampPhase } from "@packages/shared";
import { NetworkError, Transaction } from "stellar-sdk";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { fundEphemeralAccount } from "../../pendulum/pendulum.service";
import { fundMoonbeamEphemeralAccount } from "../../transactions/moonbeam/balance";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";
import {
  horizonServer,
  isMoonbeamEphemeralFunded,
  isPendulumEphemeralFunded,
  isStellarEphemeralFunded,
  NETWORK_PASSPHRASE
} from "./helpers";

export class FundEphemeralPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "fundEphemeral";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");
    const moonbeamNode = await apiManager.getApi("moonbeam");

    const { moonbeamEphemeralAddress, pendulumEphemeralAddress } = state.state as StateMetadata;

    if (!pendulumEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted. This is a bug.");
    }
    if (state.type === "on" && !moonbeamEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted. This is a bug.");
    }

    try {
      const isPendulumFunded = await isPendulumEphemeralFunded(pendulumEphemeralAddress, pendulumNode);

      let isMoonbeamFunded = true;
      if (state.type === "on" && moonbeamEphemeralAddress) {
        isMoonbeamFunded = await isMoonbeamEphemeralFunded(moonbeamEphemeralAddress, moonbeamNode);
      }

      if (state.state.stellarTarget) {
        const isFunded = await isStellarEphemeralFunded(
          state.state.stellarEphemeralAccountId,
          state.state.stellarTarget.stellarTokenDetails
        );
        if (!isFunded) {
          await this.fundStellarEphemeralAccount(state);
        }
      }

      if (!isPendulumFunded) {
        logger.info(`Funding PEN ephemeral account ${pendulumEphemeralAddress}`);
        if (state.type === "on" && state.to !== "assethub") {
          await fundEphemeralAccount("pendulum", pendulumEphemeralAddress, true);
        } else if (state.state.outputCurrency === FiatToken.BRL) {
          await fundEphemeralAccount("pendulum", pendulumEphemeralAddress, true);
        } else {
          await fundEphemeralAccount("pendulum", pendulumEphemeralAddress, false);
        }
      } else {
        logger.info("Pendulum ephemeral address already funded.");
      }

      if (state.type === "on" && !isMoonbeamFunded) {
        logger.info(`Funding moonbeam ephemeral accout ${moonbeamEphemeralAddress}`);

        const destinationNetwork = getNetworkFromDestination(state.to);
        // For onramp case, "to" is always a network.
        if (!destinationNetwork) {
          throw new Error("FundEphemeralPhaseHandler: Invalid destination network.");
        }

        await fundMoonbeamEphemeralAccount(moonbeamEphemeralAddress);
      }
    } catch (e) {
      console.error("Error in FundEphemeralPhaseHandler:", e);
      const recoverableError = this.createRecoverableError("Error funding ephemeral account");
      throw recoverableError;
    }

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    // onramp case
    if (state.type === "on") {
      return "moonbeamToPendulumXcm";
    }

    // off ramp cases
    if (state.type === "off" && state.from === "assethub") {
      return "distributeFees";
    } else {
      return "moonbeamToPendulum"; // Via contract.subsidizePreSwap
    }
  }

  protected async fundStellarEphemeralAccount(state: RampState): Promise<void> {
    const { txData: stellarCreationTransactionXDR } = this.getPresignedTransaction(state, "stellarCreateAccount");
    if (typeof stellarCreationTransactionXDR !== "string") {
      throw new Error(
        "FundEphemeralHandler: `stellarCreateAccount` transaction is not a string -> not an encoded Stellar transaction."
      );
    }

    try {
      const stellarCreationTransaction = new Transaction(stellarCreationTransactionXDR, NETWORK_PASSPHRASE);
      logger.info(
        `Submitting stellar account creation transaction to create ephemeral account: ${state.state.stellarEphemeralAccountId}`
      );
      await horizonServer.submitTransaction(stellarCreationTransaction);
    } catch (e) {
      const horizonError = e as NetworkError;
      if (horizonError.response.data?.status === 400) {
        logger.info(
          `Could not submit the stellar account creation transaction ${JSON.stringify(
            horizonError.response.data.extras.result_codes
          )}`
        );

        // TODO this error may need adjustment, as the `tx_bad_seq` may be due to parallel ramps and ephemeral creations.
        if (horizonError.response.data.extras.result_codes.transaction === "tx_bad_seq") {
          logger.info("Recovery mode: Creation already performed.");
        }
        logger.error(`Could not submit the stellar creation transaction: ${horizonError.response.data.extras}`);
        throw new Error("Could not submit the stellar creation transaction");
      } else {
        logger.error(`Could not submit the stellar creation transaction: ${horizonError.response.data}`);
        throw new Error("Could not submit the stellar creation transaction");
      }
    }
  }
}

export default new FundEphemeralPhaseHandler();
