import {
  createEvmClientsAndConfig,
  createOnrampRouteParams,
  getRoute,
  getStatus,
  getStatusAxelarScan,
  Networks,
  OnChainToken,
  RampPhase
} from "@packages/shared";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam } from "viem/chains";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import { axelarGasServiceAbi } from "../../../../contracts/AxelarGasService";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { getTokenDetailsForEvmDestination } from "../../ramp/quote.service/gross-output";
import { BasePhaseHandler } from "../base-phase-handler";

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const AXL_GAS_SERVICE_MOONBEAM = "0x2d5d7d31F671F86C782533cc367F14109a082712";
/**
 * Handler for the squidRouter pay phase. Checks the status of the Axelar bridge and pays on native GLMR fee.
 */
export class SquidRouterPayPhaseHandler extends BasePhaseHandler {
  private publicClient: ReturnType<typeof createPublicClient>;
  private walletClient: ReturnType<typeof createEvmClientsAndConfig>["walletClient"];

  constructor() {
    super();
    this.publicClient = createPublicClient({
      chain: moonbeam,
      transport: http()
    });
    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
    const { walletClient } = createEvmClientsAndConfig(moonbeamExecutorAccount, moonbeam);
    this.walletClient = walletClient;
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "squidRouterPay";
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouterPay phase for ramp ${state.id}`);

    if (state.type === "off") {
      logger.info("squidRouterPay phase is not supported for off-ramp");
      return state;
    }

    try {
      // Get the bridge hash
      const bridgeCallHash = state.state.squidRouterSwapHash;
      if (!bridgeCallHash) {
        throw new Error("SquidRouterPayPhaseHandler: Missing bridge hash in state for squidRouterPay phase. State corrupted.");
      }

      // Enter check status loop
      await this.checkStatus(state, bridgeCallHash);

      return this.transitionToNextPhase(state, "complete");
    } catch (error: unknown) {
      logger.error(`SquidRouterPayPhaseHandler: Error in squidRouterPay phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  /**
   * Gets the status of the Axelar bridge
   * @param txHash The swap (bridgeCall) transaction hash
   */
  private async checkStatus(state: RampState, swapHash: string): Promise<void> {
    try {
      // Found to be unreliable. We call it anyway so that squidrouter can log the status.
      getStatus(swapHash).catch(error => logger.error(`Couldn't fetch status for ${swapHash} from squidrouter`, error.message));

      let isExecuted = false;
      let payTxHash: string | undefined = state.state.squidRouterPayTxHash; // in case of recovery, we may have already paid.
      while (!isExecuted) {
        const axelarScanStatus = await getStatusAxelarScan(swapHash);

        //no status found is considered a recoverable error.
        if (!axelarScanStatus) {
          logger.warn(`SquidRouterPayPhaseHandler: No status found for swap hash ${swapHash}.`);
          throw this.createRecoverableError("No status found for swap hash.");
        }
        if (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed") {
          isExecuted = true;
          logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Axelar.`);
          break;
        }

        if (!payTxHash) {
          const glmrToFundRaw = await this.fetchFreshRouteValue(state);

          const logIndex = Number(axelarScanStatus.id.split("_")[2]);
          payTxHash = await this.executeFundTransaction(glmrToFundRaw, swapHash as `0x${string}`, logIndex);

          await state.update({
            state: {
              ...state.state,
              squidRouterPayTxHash: payTxHash
            }
          });
        }

        await new Promise(resolve => setTimeout(resolve, AXELAR_POLLING_INTERVAL_MS));
      }
    } catch (error) {
      if (error && error instanceof PhaseError && error.isRecoverable) {
        throw error;
      }
      throw new Error(`SquidRouterPayPhaseHandler: Error waiting checking for Axelar bridge transaction: ${error}`);
    }
  }

  /**
   * Execute a call to the Axelar gas service and fund the bridge process.
   * @param glmrUnits The amount of GLMR to fund the transaction with.
   * @returns Hash of the transaction that funds the Axelar gas service.
   */
  private async executeFundTransaction(gmlrValueRaw: string, swapHash: `0x${string}`, logIndex: number): Promise<string> {
    try {
      // Create addNativeGas transaction data
      const refundAddress = this.walletClient.account.address;
      const transactionData = encodeFunctionData({
        abi: axelarGasServiceAbi,
        args: [swapHash, logIndex, refundAddress],
        functionName: "addNativeGas"
      });
      const { maxFeePerGas, maxPriorityFeePerGas } = await this.publicClient.estimateFeesPerGas();
      logger.info(
        `SquidRouterPayPhaseHandler: Funding Axelar gas service for swap hash ${swapHash} with GLMR: ${gmlrValueRaw}`
      );
      const gasPaymentHash = await this.walletClient.sendTransaction({
        data: transactionData,
        maxFeePerGas,
        maxPriorityFeePerGas,
        to: AXL_GAS_SERVICE_MOONBEAM as `0x${string}`,
        value: BigInt(gmlrValueRaw)
      });
      logger.info(`SquidRouterPayPhaseHandler: Fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error("SquidRouterPayPhaseHandler: Error funding gas to Axelar gas service: ", error);
      throw new Error("SquidRouterPayPhaseHandler: Failed to send transaction");
    }
  }

  private async fetchFreshRouteValue(ramp: RampState): Promise<string> {
    const toNetwork = ramp.to as Networks; // Safe casting. There is no other option for onramp.
    const stateMeta = ramp.state;
    const outputTokenDetails = getTokenDetailsForEvmDestination(stateMeta.outputTokenType as OnChainToken, toNetwork);

    try {
      const routeParams = createOnrampRouteParams(
        stateMeta.moonbeamEphemeralAddress,
        stateMeta.outputAmountBeforeFinalStep.raw,
        outputTokenDetails,
        toNetwork,
        ramp.state.destinationAddress
      );
      const routeResult = await getRoute(routeParams);

      const { route } = routeResult.data;
      const feeValue = route.transactionRequest.value;
      logger.info(`SquidRouterPayPhaseHandler: Fresh route value fetched: ${feeValue}`);
      return feeValue;
    } catch (error) {
      logger.error("SquidRouterPayPhaseHandler: Error fetching fresh route:", error);
      throw new Error("SquidRouterPayPhaseHandler: Failed to fetch fresh route");
    }
  }
}

export default new SquidRouterPayPhaseHandler();
