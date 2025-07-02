import { FiatToken, getNetworkId, getOnChainTokenDetails, Networks, OnChainToken, RampPhase } from "@packages/shared";
import Big from "big.js";
import { createWalletClient, encodeFunctionData, http, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam, polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import { axelarGasServiceAbi } from "../../../../contracts/AxelarGasService";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { EvmClientManager } from "../../evm/clientManager";
import { createMoonbeamClientsAndConfig } from "../../moonbeam/createServices";
import { getStatus, SquidRouterPayResponse } from "../../transactions/squidrouter/route";
import { BasePhaseHandler } from "../base-phase-handler";

interface AxelarScanStatusResponse {
  is_insufficient_fee: boolean;
  status: string; // executed or express_executed (for complete).
  fees: AxelarScanStatusFees; // the fees for the swap.
  id: string; // the id of the swap.
}

interface AxelarScanStatusFees {
  base_fee: number; // in units of the native token.
  source_base_fee: number;
  destination_base_fee: number;
  source_express_fee: {
    total: number;
  };
  source_confirm_fee: number;
  destination_express_fee: {
    total: number;
  };
  source_token: {
    gas_price: string;
    gas_price_in_units: {
      decimals: number;
      value: string;
    };
  };
  execute_gas_multiplier: number;
}

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
    this.moonbeamPublicClient = evmClientManager.getClient("moonbeam");
    this.polygonPublicClient = evmClientManager.getClient("polygon");

    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
    this.moonbeamWalletClient = evmClientManager.getWalletClient("moonbeam", moonbeamExecutorAccount);
    this.polygonWalletClient = evmClientManager.getWalletClient("polygon", moonbeamExecutorAccount);
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

        const axelarScanStatus = await this.getStatusAxelarScan(swapHash);

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
  ): Promise<string> {
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
  ): Promise<string> {
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
  ): Promise<string> {
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

  private async getStatusAxelarScan(swapHash: string): Promise<AxelarScanStatusResponse> {
    try {
      // POST call, https://api.axelarscan.io/gmp/searchGMP
      const response = await fetch("https://api.axelarscan.io/gmp/searchGMP", {
        body: JSON.stringify({
          txHash: swapHash
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`Error fetching status from axelar scan API: ${response.statusText}`);
      }
      const responseData = await response.json();
      return (responseData as { data: unknown[] }).data[0] as AxelarScanStatusResponse;
    } catch (error) {
      if ((error as { response: unknown }).response) {
        logger.error(
          `SquidRouterPayPhaseHandler: Couldn't get status for ${swapHash} from AxelarScan:`,
          (error as { response: unknown }).response
        );
      }
      throw error;
    }
  }

  private async getSquidrouterStatus(swapHash: string, state: RampState): Promise<SquidRouterPayResponse> {
    try {
      const fromChainId = getNetworkId(Networks.Polygon)?.toString(); // Always Polygon for Monerium onramp.
      const toChainId = getNetworkId(state.to)?.toString();

      if (!fromChainId || !toChainId) {
        throw new Error("SquidRouterPayPhaseHandler: Invalid from or to network for Squidrouter status check");
      }

      const squidrouterStatus = await getStatus(swapHash, fromChainId, toChainId);
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

    // L1 data fee??

    const totalGasFee = baseFeeInUnitsBig.add(executionFeeWithMultiplier);
    //  .add(l1ExecutionFeeWithMultiplier);

    // Convert to raw, using source decimals
    const sourceDecimals = feeResponse.source_token.gas_price_in_units.decimals;
    const totalGasFeeRaw = totalGasFee.mul(Big(10).pow(sourceDecimals));

    return totalGasFeeRaw.lt(0) ? "0" : totalGasFeeRaw.toFixed(0, 0);
  }
}

export default new SquidRouterPayPhaseHandler();
