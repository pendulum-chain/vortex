import { FiatToken, getNetworkFromDestination, RampPhase } from "@packages/shared";
import { NetworkError, Transaction } from "stellar-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY, POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS } from "../../../../constants/constants";
import RampState from "../../../../models/rampState.model";
import { EvmClientManager } from "../../evm/clientManager";
import { fundMoonbeamEphemeralAccount } from "../../moonbeam/balance";
import { ApiManager } from "../../pendulum/apiManager";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { fundEphemeralAccount } from "../../pendulum/pendulum.service";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

import {
  horizonServer,
  isMoonbeamEphemeralFunded,
  isPendulumEphemeralFunded,
  isPolygonEphemeralFunded,
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

    const { moonbeamEphemeralAddress, pendulumEphemeralAddress, polygonEphemeralAddress } = state.state as StateMetadata;
    const requiresPendulumEphemeralAddress = !(state.type === "on" && state.state.inputCurrency === FiatToken.EURC);

    // Ephemeral checks.
    if (!pendulumEphemeralAddress && requiresPendulumEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing pendulumEphemeralAddress. This is a bug.");
    }
    if (state.type === "on" && state.state.inputCurrency === FiatToken.BRL && !moonbeamEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing moonbeamEphemeralAddress. This is a bug.");
    }
    if (state.type === "on" && state.state.inputCurrency === FiatToken.EURC && !polygonEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing polygonEphemeralAddress. This is a bug.");
    }

    try {
      let isPendulumFunded = true;
      if (state.type === "on" && requiresPendulumEphemeralAddress) {
        isPendulumFunded = await isPendulumEphemeralFunded(pendulumEphemeralAddress, pendulumNode);
      }

      let isMoonbeamFunded = true;
      if (state.type === "on" && moonbeamEphemeralAddress) {
        isMoonbeamFunded = await isMoonbeamEphemeralFunded(moonbeamEphemeralAddress, moonbeamNode);
      }

      let isPolygonFunded = true;
      if (state.type === "on" && polygonEphemeralAddress) {
        isPolygonFunded = await isPolygonEphemeralFunded(polygonEphemeralAddress);
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

      if (state.type === "on" && !isPolygonFunded) {
        logger.info(`Funding polygon ephemeral accout ${polygonEphemeralAddress}`);
        await this.fundPolygonEphemeralAccount(state);
      } else {
        logger.info("Polygon ephemeral address already funded.");
      }
    } catch (e) {
      console.error("Error in FundEphemeralPhaseHandler:", e);
      const recoverableError = this.createRecoverableError("Error funding ephemeral account");
      throw recoverableError;
    }
    // await 30 seconds to ensure the funding is settled.
    await new Promise(resolve => setTimeout(resolve, 30000));

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    // brla onramp case
    if (state.type === "on" && state.state.inputCurrency === FiatToken.BRL) {
      return "moonbeamToPendulumXcm";
    }
    // monerium onramp case
    if (state.type === "on" && state.state.inputCurrency === FiatToken.EURC) {
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

  protected async fundPolygonEphemeralAccount(state: RampState): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const publicClient = evmClientManager.getClient("polygon");

      const ephmeralAddress = state.state.polygonEphemeralAddress;
      const fundingAmountRaw = multiplyByPowerOfTen(
        POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS,
        polygon.nativeCurrency.decimals
      ).toFixed();

      // We use Moonbeam's funding account to fund the ephemeral account on Polygon.
      const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
      const walletClient = evmClientManager.getWalletClient("moonbeam", fundingAccount);

      const txHash = await walletClient.sendTransaction({
        to: ephmeralAddress as `0x${string}`,
        value: BigInt(fundingAmountRaw)
      });

      const receipt = await publicClient.waitForTransactionReceipt({
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
