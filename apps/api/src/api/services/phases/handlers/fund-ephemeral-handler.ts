import { FiatToken, getNetworkFromDestination, Networks, RampPhase } from "@packages/shared";
import { NetworkError, Transaction } from "stellar-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY, POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS } from "../../../../constants/constants";
import RampState from "../../../../models/rampState.model";
import { PhaseError, UnrecoverablePhaseError } from "../../../errors/phase-error";
import { EvmClientManager } from "../../evm/clientManager";
import { fundMoonbeamEphemeralAccount } from "../../moonbeam/balance";
import { ApiManager } from "../../pendulum/apiManager";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { fundEphemeralAccount } from "../../pendulum/pendulum.service";
import { BasePhaseHandler } from "../base-phase-handler";
import { validateStellarPaymentSequenceNumber } from "../helpers/stellar-sequence-validator";
import { StateMetadata } from "../meta-state-types";
import {
  horizonServer,
  isMoonbeamEphemeralFunded,
  isPendulumEphemeralFunded,
  isPolygonEphemeralFunded,
  isStellarEphemeralFunded,
  NETWORK_PASSPHRASE
} from "./helpers";

export function isStellarNetworkError(error: unknown): error is NetworkError {
  return (
    error instanceof Error &&
    "response" in error &&
    error.response !== null &&
    typeof error.response === "object" &&
    "data" in error.response
  );
}

function isOnramp(state: RampState): boolean {
  return state.type === "on";
}

export class FundEphemeralPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "fundEphemeral";
  }

  protected getRequiresPendulumEphemeralAddress(state: RampState): boolean {
    // Pendulum ephemeral address is required for all cases except when the input currency is EURC.
    if (isOnramp(state) && state.state.inputCurrency === FiatToken.EURC) {
      return false;
    }
    return true;
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");
    const moonbeamNode = await apiManager.getApi("moonbeam");

    const { moonbeamEphemeralAddress, pendulumEphemeralAddress, polygonEphemeralAddress } = state.state as StateMetadata;
    const requiresPendulumEphemeralAddress = this.getRequiresPendulumEphemeralAddress(state);

    // Ephemeral checks.
    if (!pendulumEphemeralAddress && requiresPendulumEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing pendulumEphemeralAddress. This is a bug.");
    }
    if (isOnramp(state) && state.state.inputCurrency === FiatToken.BRL && !moonbeamEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing moonbeamEphemeralAddress. This is a bug.");
    }
    if (isOnramp(state) && state.state.inputCurrency === FiatToken.EURC && !polygonEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing polygonEphemeralAddress. This is a bug.");
    }

    try {
      const isPendulumFunded = requiresPendulumEphemeralAddress
        ? await isPendulumEphemeralFunded(pendulumEphemeralAddress, pendulumNode)
        : true;

      const isMoonbeamFunded =
        isOnramp(state) && moonbeamEphemeralAddress
          ? await isMoonbeamEphemeralFunded(moonbeamEphemeralAddress, moonbeamNode)
          : true;

      const isPolygonFunded =
        isOnramp(state) && polygonEphemeralAddress ? await isPolygonEphemeralFunded(polygonEphemeralAddress) : true;

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
        if (isOnramp(state) && state.to !== "assethub") {
          await fundEphemeralAccount("pendulum", pendulumEphemeralAddress, true);
        } else if (state.state.outputCurrency === FiatToken.BRL) {
          await fundEphemeralAccount("pendulum", pendulumEphemeralAddress, true);
        } else {
          await fundEphemeralAccount("pendulum", pendulumEphemeralAddress, false);
        }
      } else {
        logger.info("Pendulum ephemeral address already funded.");
      }

      if (isOnramp(state) && !isMoonbeamFunded) {
        logger.info(`Funding moonbeam ephemeral accout ${moonbeamEphemeralAddress}`);

        const destinationNetwork = getNetworkFromDestination(state.to);
        // For onramp case, "to" is always a network.
        if (!destinationNetwork) {
          throw new Error("FundEphemeralPhaseHandler: Invalid destination network.");
        }

        await fundMoonbeamEphemeralAccount(moonbeamEphemeralAddress);
      }

      if (isOnramp(state) && !isPolygonFunded) {
        logger.info(`Funding polygon ephemeral accout ${polygonEphemeralAddress}`);
        await this.fundPolygonEphemeralAccount(state);
      } else {
        logger.info("Polygon ephemeral address already funded.");
      }
    } catch (e) {
      console.error("Error in FundEphemeralPhaseHandler:", e);

      // Preserve UnrecoverablePhaseError
      if (e instanceof UnrecoverablePhaseError) {
        throw e;
      }

      const recoverableError = this.createRecoverableError("Error funding ephemeral account");
      throw recoverableError;
    }
    // await 30 seconds to ensure the funding is settled.
    await new Promise(resolve => setTimeout(resolve, 30000));

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    // brla onramp case
    if (isOnramp(state) && state.state.inputCurrency === FiatToken.BRL) {
      return "moonbeamToPendulumXcm";
    }
    // monerium onramp case
    if (isOnramp(state) && state.state.inputCurrency === FiatToken.EURC) {
      return "moneriumOnrampSelfTransfer";
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

      logger.info("Validating stellar payment sequence number after account creation");
      try {
        await validateStellarPaymentSequenceNumber(state, state.state.stellarEphemeralAccountId);
      } catch (validationError) {
        logger.error(`Stellar payment sequence validation failed after account creation: ${validationError}`);
        throw this.createUnrecoverableError("Stellar payment sequence validation failed after account creation");
      }
    } catch (e) {
      if (e instanceof UnrecoverablePhaseError) {
        throw e;
      }

      // when validateStellarPaymentSequenceNumber throws an error, it's not NetworkError
      if (isStellarNetworkError(e)) {
        if (e.response.data?.status === 400) {
          logger.info(
            `Could not submit the stellar account creation transaction ${JSON.stringify(e.response.data.extras.result_codes)}`
          );

          // TODO this error may need adjustment, as the `tx_bad_seq` may be due to parallel ramps and ephemeral creations.
          if (e.response.data.extras.result_codes.transaction === "tx_bad_seq") {
            logger.info("Recovery mode: Creation already performed.");

            try {
              logger.info("Validating stellar payment sequence number in recovery mode");
              await validateStellarPaymentSequenceNumber(state, state.state.stellarEphemeralAccountId);
            } catch (validationError) {
              logger.error(`Sequence number validation failed in recovery mode: ${validationError}`);
              throw this.createUnrecoverableError("Stellar payment sequence validation failed after account creation recovery");
            }
          }
          logger.error(`Could not submit the stellar creation transaction: ${e.response.data.extras}`);
          throw new Error("Could not submit the stellar creation transaction");
        } else {
          logger.error(`Could not submit the stellar creation transaction: ${e.response.data}`);
          throw new Error("Could not submit the stellar creation transaction");
        }
      } else {
        logger.error(`Error in stellar account creation: ${e}`);
        throw new Error("Could not submit the stellar creation transaction");
      }
    }
  }

  protected async fundPolygonEphemeralAccount(state: RampState): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const polygonClient = evmClientManager.getClient(Networks.Polygon);

      const ephmeralAddress = state.state.polygonEphemeralAddress;
      const fundingAmountRaw = multiplyByPowerOfTen(
        POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS,
        polygon.nativeCurrency.decimals
      ).toFixed();

      // We use Moonbeam's funding account to fund the ephemeral account on Polygon.
      const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
      const walletClient = evmClientManager.getWalletClient(Networks.Polygon, fundingAccount);

      const txHash = await walletClient.sendTransaction({
        to: ephmeralAddress as `0x${string}`,
        value: BigInt(fundingAmountRaw)
      });

      const receipt = await polygonClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`
      });

      if (!receipt || receipt.status !== "success") {
        throw new Error(`FundEphemeralPhaseHandler: Transaction ${txHash} failed or was not found`);
      }
    } catch (error) {
      console.error("FundEphemeralPhaseHandler: Error during funding Polygon ephemeral:", error);
      throw new Error("FundEphemeralPhaseHandler: Error during funding Polygon ephemeral: " + error);
    }
  }
}

export default new FundEphemeralPhaseHandler();
