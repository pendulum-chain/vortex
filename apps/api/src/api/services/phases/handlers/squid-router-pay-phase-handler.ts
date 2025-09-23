import {
  AxelarScanStatusFees,
  EvmClientManager,
  FiatToken,
  getNetworkId,
  getStatus,
  getStatusAxelarScan,
  Networks,
  RampDirection,
  RampPhase,
  SquidRouterPayResponse
} from "@packages/shared";
import { nativeToDecimal } from "@packages/shared/src/helpers/parseNumbers";
import Big from "big.js";
import { createWalletClient, encodeFunctionData, Hash, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam, polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import { axelarGasServiceAbi } from "../../../../contracts/AxelarGasService";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { PhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const SQUIDROUTER_INITIAL_DELAY_MS = 60000; // 60 seconds
const AXL_GAS_SERVICE_EVM = "0x2d5d7d31F671F86C782533cc367F14109a082712";
const DEFAULT_SQUIDROUTER_GAS_ESTIMATE = "800000"; // Estimate used to calculate part of the gas fee for SquidRouter transactions.
/**
 * Handler for the squidRouter pay phase. Checks the status of the Axelar bridge and pays on native GLMR fee.
 */
export class SquidRouterPayPhaseHandler extends BasePhaseHandler {
  private moonbeamPublicClient: PublicClient;
  private polygonPublicClient: PublicClient;
  private moonbeamWalletClient: ReturnType<typeof createWalletClient>;
  private polygonWalletClient: ReturnType<typeof createWalletClient>;

  constructor() {
    super();
    const evmClientManager = EvmClientManager.getInstance();
    this.moonbeamPublicClient = evmClientManager.getClient(Networks.Moonbeam);
    this.polygonPublicClient = evmClientManager.getClient(Networks.Polygon);

    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
    this.moonbeamWalletClient = evmClientManager.getWalletClient(Networks.Moonbeam, moonbeamExecutorAccount);
    this.polygonWalletClient = evmClientManager.getWalletClient(Networks.Polygon, moonbeamExecutorAccount);
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

    if (state.type === RampDirection.SELL) {
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
      let isExecuted = false;
      let payTxHash: string | undefined = state.state.squidRouterPayTxHash; // in case of recovery, we may have already paid.
      // initial delay to allow for API indexing.
      await new Promise(resolve => setTimeout(resolve, SQUIDROUTER_INITIAL_DELAY_MS));
      while (!isExecuted) {
        const squidrouterStatus = await this.getSquidrouterStatus(swapHash, state);

        if (squidrouterStatus.status === "success") {
          isExecuted = true;
          logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Squidrouter.`);
          break;
        }
        if (!squidrouterStatus) {
          logger.warn(`SquidRouterPayPhaseHandler: No squidrouter status found for swap hash ${swapHash}.`);
          throw this.createRecoverableError("No squidrouter status found for swap hash.");
        }

        // If route is on the same chain, we must skip the Axelar check.
        if (!squidrouterStatus.isGMPTransaction) {
          await new Promise(resolve => setTimeout(resolve, AXELAR_POLLING_INTERVAL_MS));
        }

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
          const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
          const logIndex = Number(axelarScanStatus.id.split("_")[2]);

          payTxHash = await this.executeFundTransaction(nativeToFundRaw, swapHash as `0x${string}`, logIndex, state);

          const isPolygon = state.state.inputCurrency !== FiatToken.BRL;
          const subsidyToken = isPolygon ? SubsidyToken.MATIC : SubsidyToken.GLMR;
          const subsidyAmount = nativeToDecimal(nativeToFundRaw, 18).toNumber(); // Both MATIC and GLMR have 18 decimals
          const payerAccount = isPolygon
            ? this.polygonWalletClient.account?.address
            : this.moonbeamWalletClient.account?.address;

          if (payerAccount) {
            await this.createSubsidy(state, subsidyAmount, subsidyToken, payerAccount, payTxHash);
          }

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
   * Routes to the appropriate network-specific method based on input currency.
   * @param tokenValueRaw The amount of native token to fund the transaction with.
   * @param swapHash The swap transaction hash.
   * @param logIndex The log index from Axelar scan.
   * @param state The current ramp state.
   * @returns Hash of the transaction that funds the Axelar gas service.
   */
  private async executeFundTransaction(
    tokenValueRaw: string,
    swapHash: `0x${string}`,
    logIndex: number,
    state: RampState
  ): Promise<Hash> {
    if (state.state.inputCurrency === FiatToken.BRL) {
      return this.executeFundTransactionOnMoonbeam(tokenValueRaw, swapHash, logIndex);
    } else {
      return this.executeFundTransactionOnPolygon(tokenValueRaw, swapHash, logIndex);
    }
  }

  /**
   * Execute a call to the Axelar gas service on Moonbeam network.
   * @param tokenValueRaw The amount of GLMR to fund the transaction with.
   * @param swapHash The swap transaction hash.
   * @param logIndex The log index from Axelar scan.
   * @returns Hash of the transaction that funds the Axelar gas service.
   */
  private async executeFundTransactionOnMoonbeam(
    tokenValueRaw: string,
    swapHash: `0x${string}`,
    logIndex: number
  ): Promise<Hash> {
    try {
      const walletClientAccount = this.moonbeamWalletClient.account;

      if (!walletClientAccount) {
        throw new Error("SquidRouterPayPhaseHandler: Moonbeam wallet client account not found.");
      }

      const transactionData = encodeFunctionData({
        abi: axelarGasServiceAbi,
        args: [swapHash, logIndex, walletClientAccount.address],
        functionName: "addNativeGas"
      });

      const { maxFeePerGas, maxPriorityFeePerGas } = await this.moonbeamPublicClient.estimateFeesPerGas();

      const gasPaymentHash = await this.moonbeamWalletClient.sendTransaction({
        account: walletClientAccount,
        chain: moonbeam,
        data: transactionData,
        maxFeePerGas,
        maxPriorityFeePerGas,
        to: AXL_GAS_SERVICE_EVM as `0x${string}`,
        value: BigInt(tokenValueRaw)
      });

      logger.info(`SquidRouterPayPhaseHandler: Moonbeam fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error("SquidRouterPayPhaseHandler: Error funding gas to Axelar gas service on Moonbeam: ", error);
      throw new Error("SquidRouterPayPhaseHandler: Failed to send Moonbeam transaction");
    }
  }

  /**
   * Execute a call to the Axelar gas service on Polygon network.
   * @param tokenValueRaw The amount of MATIC to fund the transaction with.
   * @param swapHash The swap transaction hash.
   * @param logIndex The log index from Axelar scan.
   * @returns Hash of the transaction that funds the Axelar gas service.
   */
  private async executeFundTransactionOnPolygon(
    tokenValueRaw: string,
    swapHash: `0x${string}`,
    logIndex: number
  ): Promise<Hash> {
    try {
      const walletClientAccount = this.polygonWalletClient.account;

      if (!walletClientAccount) {
        throw new Error("SquidRouterPayPhaseHandler: Polygon wallet client account not found.");
      }

      // Create addNativeGas transaction data
      const transactionData = encodeFunctionData({
        abi: axelarGasServiceAbi,
        args: [swapHash, logIndex, walletClientAccount.address],
        functionName: "addNativeGas"
      });

      const { maxFeePerGas, maxPriorityFeePerGas } = await this.polygonPublicClient.estimateFeesPerGas();

      const gasPaymentHash = await this.polygonWalletClient.sendTransaction({
        account: walletClientAccount,
        chain: polygon,
        data: transactionData,
        maxFeePerGas,
        maxPriorityFeePerGas,
        to: AXL_GAS_SERVICE_EVM as `0x${string}`,
        value: BigInt(tokenValueRaw)
      });

      logger.info(`SquidRouterPayPhaseHandler: Polygon fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error("SquidRouterPayPhaseHandler: Error funding gas to Axelar gas service on Polygon: ", error);
      throw new Error("SquidRouterPayPhaseHandler: Failed to send Polygon transaction");
    }
  }

  private async getSquidrouterStatus(swapHash: string, state: RampState): Promise<SquidRouterPayResponse> {
    try {
      // Always Polygon for Monerium onramp, Moonbeam for BRL
      const fromChain = state.state.inputCurrency === FiatToken.EURC ? Networks.Polygon : Networks.Moonbeam;
      const fromChainId = getNetworkId(fromChain)?.toString();
      const toChainId = getNetworkId(state.to)?.toString();

      if (!fromChainId || !toChainId) {
        throw new Error("SquidRouterPayPhaseHandler: Invalid from or to network for Squidrouter status check");
      }

      const squidrouterStatus = await getStatus(swapHash, fromChainId, toChainId, state.state.squidRouterQuoteId);
      return squidrouterStatus;
    } catch (error) {
      logger.error(`SquidRouterPayPhaseHandler: Error fetching Squidrouter status for swap hash ${swapHash}:`, error);
      throw this.createRecoverableError(
        `SquidRouterPayPhaseHandler: Failed to fetch Squidrouter status for swap hash ${swapHash}`
      );
    }
  }

  private calculateGasFeeInUnits(feeResponse: AxelarScanStatusFees, estimatedGas: string | number): string {
    const baseFeeInUnitsBig = Big(feeResponse.source_base_fee);

    // Calculate the Execution Fee (with multiplier) in native units
    // This is the cost to execute the transaction on the destination chain.
    const estimatedGasBig = Big(estimatedGas);
    const sourceGasPriceBig = Big(feeResponse.source_token.gas_price);

    // Calculate base execution fee: gasLimit * gasPrice
    const executionFeeUnits = estimatedGasBig.mul(sourceGasPriceBig);

    // Apply the gas multiplier.
    const multiplier = feeResponse.execute_gas_multiplier;
    const executionFeeWithMultiplier = executionFeeUnits.mul(multiplier);

    const totalGasFee = baseFeeInUnitsBig.add(executionFeeWithMultiplier);
    //  .add(l1ExecutionFeeWithMultiplier);

    // Convert to raw, using source decimals
    const sourceDecimals = feeResponse.source_token.gas_price_in_units.decimals;
    const totalGasFeeRaw = totalGasFee.mul(Big(10).pow(sourceDecimals));

    return totalGasFeeRaw.lt(0) ? "0" : totalGasFeeRaw.toFixed(0, 0);
  }
}

export default new SquidRouterPayPhaseHandler();
