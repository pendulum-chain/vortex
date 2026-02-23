import {
  AxelarScanStatusFees,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  FiatToken,
  getNetworkId,
  getOnChainTokenDetails,
  getStatus,
  getStatusAxelarScan,
  Networks,
  nativeToDecimal,
  OnChainToken,
  RampDirection,
  RampPhase,
  SquidRouterPayResponse
} from "@vortexfi/shared";
import Big from "big.js";
import { createWalletClient, encodeFunctionData, Hash, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam, polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import { axelarGasServiceAbi } from "../../../../contracts/AxelarGasService";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { PhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const SQUIDROUTER_INITIAL_DELAY_MS = 60000; // 60 seconds
const AXL_GAS_SERVICE_EVM = "0x2d5d7d31F671F86C782533cc367F14109a082712";
const BALANCE_POLLING_TIME_MS = 10000;
// NOTE: This timeout is intentionally longer (15 minutes) than the 3–5 minute balance
// checks in other handlers. For SquidRouter/Axelar bridge flows we wait for cross-chain
// settlement and gas payment on the destination chain, which can legitimately take longer
// under network congestion or bridge delays. Reducing this timeout risks premature failure
// of otherwise successful bridge operations.
const EVM_BALANCE_CHECK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_SQUIDROUTER_GAS_ESTIMATE = "1600000"; // Estimate used to calculate part of the gas fee for SquidRouter transactions.
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
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

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
      await this.checkStatus(state, bridgeCallHash, quote);

      if (state.to === Networks.AssetHub) {
        return this.transitionToNextPhase(state, "moonbeamToPendulum");
      } else {
        return this.transitionToNextPhase(state, "finalSettlementSubsidy");
      }
    } catch (error: unknown) {
      logger.error(`SquidRouterPayPhaseHandler: Error in squidRouterPay phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  /**
   * Checks the status of the Axelar bridge and balances in parallel.
   * If a balance arrived, we consider it a success.
   * If the bridge reports success, we consider it a success.
   * Only if both fail (timeout) we throw.
   */
  private async checkStatus(state: RampState, swapHash: string, quote: QuoteTicket): Promise<void> {
    // If the destination is not an EVM network, skip the EVM balance optimization and rely on bridge status only.
    if (quote.to === Networks.AssetHub) {
      logger.info("SquidRouterPayPhaseHandler: Destination network is non-EVM; skipping EVM balance check optimization.", {
        toNetwork: quote.to
      });
      await this.checkBridgeStatus(state, swapHash, quote);
      return;
    }

    const toChain = quote.to as EvmNetworks;

    let balanceCheckPromise: Promise<Big>;

    try {
      const outTokenDetails = getOnChainTokenDetails(toChain, quote.outputCurrency as OnChainToken) as EvmTokenDetails;
      const ephemeralAddress = state.state.evmEphemeralAddress;

      if (outTokenDetails && ephemeralAddress) {
        balanceCheckPromise = checkEvmBalancePeriodically(
          outTokenDetails.erc20AddressSourceChain,
          ephemeralAddress,
          "1", // If we passed expectedAmountRaw, we might timeout if the bridge slipped and delivered slightly less.
          BALANCE_POLLING_TIME_MS,
          EVM_BALANCE_CHECK_TIMEOUT_MS,
          toChain
        );
      } else {
        logger.warn(
          "SquidRouterPayPhaseHandler: Cannot perform balance check optimization (missing expected token details or address)."
        );
        balanceCheckPromise = Promise.reject(new Error("Skipped balance check"));
      }
    } catch (err) {
      logger.warn(`SquidRouterPayPhaseHandler: Error preparing balance check: ${err}`);
      balanceCheckPromise = Promise.reject(err);
    }

    // Wrap both promises to prevent unhandled rejections after one succeeds
    const bridgeCheckPromise = this.checkBridgeStatus(state, swapHash, quote).catch(err => {
      // Re-throw to preserve the error for Promise.any
      throw err;
    });

    const balanceCheckWithErrorHandling = balanceCheckPromise.catch(err => {
      // Re-throw to preserve the error for Promise.any
      throw err;
    });

    try {
      await Promise.any([bridgeCheckPromise, balanceCheckWithErrorHandling]);
    } catch (error) {
      // Both failed.
      if (error instanceof AggregateError) {
        // Distinguish between balance check timeout and read failure
        const balanceError = error.errors.find(e => e instanceof BalanceCheckError);
        const bridgeError = error.errors.find(e => !(e instanceof BalanceCheckError));

        let errorMessage = "SquidRouterPayPhaseHandler: Both bridge status check and balance check failed.";

        if (balanceError instanceof BalanceCheckError) {
          if (balanceError.type === BalanceCheckErrorType.Timeout) {
            errorMessage += ` Balance check timed out after ${EVM_BALANCE_CHECK_TIMEOUT_MS}ms.`;
          } else if (balanceError.type === BalanceCheckErrorType.ReadFailure) {
            errorMessage += ` Balance check read failure (unexpected infrastructure issue): ${balanceError.message}.`;
          }
        }

        if (bridgeError) {
          errorMessage += ` Bridge check error: ${bridgeError instanceof Error ? bridgeError.message : String(bridgeError)}.`;
        }

        throw new Error(errorMessage);
      }
      throw error;
    }
  }

  /**
   * Gets the status of the Axelar bridge
   * @param txHash The swap (bridgeCall) transaction hash
   */
  private async checkBridgeStatus(state: RampState, swapHash: string, quote: QuoteTicket): Promise<void> {
    let isExecuted = false;
    let payTxHash: string | undefined = state.state.squidRouterPayTxHash;

    await new Promise(resolve => setTimeout(resolve, SQUIDROUTER_INITIAL_DELAY_MS));

    while (!isExecuted) {
      try {
        const squidRouterStatus = await this.getSquidrouterStatus(swapHash, state, quote);

        if (!squidRouterStatus) {
          logger.warn(`SquidRouterPayPhaseHandler: No squidRouter status found for swap hash ${swapHash}.`);
        } else if (squidRouterStatus.status === "success") {
          logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Squidrouter.`);
          isExecuted = true;
          break;
        }

        const isGmp = squidRouterStatus ? squidRouterStatus.isGMPTransaction : true;

        if (isGmp) {
          const axelarScanStatus = await getStatusAxelarScan(swapHash);

          if (!axelarScanStatus) {
            logger.info(`SquidRouterPayPhaseHandler: Axelar status not found yet for hash ${swapHash}.`);
          } else if (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed") {
            logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Axelar.`);
            isExecuted = true;
            break;
          } else if (!payTxHash) {
            logger.info("SquidRouterPayPhaseHandler: Bridge transaction detected on Axelar. Proceeding to fund gas.");

            const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
            const logIndex = Number(axelarScanStatus.id.split("_")[2]);

            payTxHash = await this.executeFundTransaction(nativeToFundRaw, swapHash as `0x${string}`, logIndex, state, quote);

            const isPolygon = quote.inputCurrency !== FiatToken.BRL;
            const subsidyToken = isPolygon ? SubsidyToken.MATIC : SubsidyToken.GLMR;
            const subsidyAmount = nativeToDecimal(nativeToFundRaw, 18).toNumber();
            const payerAccount = isPolygon
              ? this.polygonWalletClient.account?.address
              : this.moonbeamWalletClient.account?.address;

            if (payerAccount) {
              await this.createSubsidy(state, subsidyAmount, subsidyToken, payerAccount, payTxHash);
            }

            await state.update({
              state: { ...state.state, squidRouterPayTxHash: payTxHash }
            });
          }
        } else {
          logger.info("SquidRouterPayPhaseHandler: Same-chain transaction detected. Skipping Axelar check.");
        }
      } catch (error) {
        logger.error(`SquidRouterPayPhaseHandler: Error in bridge status loop for ${swapHash}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, AXELAR_POLLING_INTERVAL_MS));
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
    state: RampState,
    quote: QuoteTicket
  ): Promise<Hash> {
    if (quote.inputCurrency === FiatToken.BRL) {
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

  private async getSquidrouterStatus(swapHash: string, state: RampState, quote: QuoteTicket): Promise<SquidRouterPayResponse> {
    try {
      // Always Polygon for Monerium onramp, Moonbeam for BRL
      const fromChain =
        quote.inputCurrency === FiatToken.EURC || quote.inputCurrency === FiatToken.USD ? Networks.Polygon : Networks.Moonbeam;
      const fromChainId = getNetworkId(fromChain)?.toString();
      const toChain = quote.to === Networks.AssetHub ? Networks.Moonbeam : quote.to;
      const toChainId = getNetworkId(toChain)?.toString();

      if (!fromChainId || !toChainId) {
        throw new Error("SquidRouterPayPhaseHandler: Invalid from or to network for Squidrouter status check");
      }

      const squidRouterStatus = await getStatus(swapHash, fromChainId, toChainId, state.state.squidRouterQuoteId);
      return squidRouterStatus;
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
