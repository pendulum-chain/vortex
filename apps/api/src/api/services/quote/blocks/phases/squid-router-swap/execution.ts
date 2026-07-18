import {
  AxelarScanStatusFees,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  evmTokenConfig,
  getEvmBalance,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  getStatus,
  getStatusAxelarScan,
  isEvmTokenDetails,
  isNetworkEVM,
  Networks,
  nativeToDecimal,
  OnChainToken,
  RampPhase,
  SquidRouterPayResponse
} from "@vortexfi/shared";
import { Big } from "big.js";
import { encodeFunctionData, Hash } from "viem";
import logger from "../../../../../../config/logger";
import { axelarGasServiceAbi } from "../../../../../../contracts/AxelarGasService";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const SQUIDROUTER_INITIAL_DELAY_MS = 60000; // 60 seconds
const AXL_GAS_SERVICE_EVM = "0x2d5d7d31F671F86C782533cc367F14109a082712";
const BALANCE_POLLING_TIME_MS = 10000;
// Intentionally longer (15 minutes) than the balance checks in other executors: cross-chain
// settlement and destination gas payment can legitimately take longer under congestion.
const EVM_BALANCE_CHECK_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_SQUIDROUTER_GAS_ESTIMATE = "1600000";

// Port of the production SquidRouterPhaseHandler without the route short-circuits
// (direct-transfer, Alfredpay, same-chain passthrough): a flow that pipes this block always
// bridges, so the skips are dead branches here.
export class SquidRouterSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "squidRouterSwap";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouter phase for ramp ${state.id}`);

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const bridgeMeta = quote.metadata.evmToEvm;
    if (
      !bridgeMeta?.inputAmountRaw ||
      !bridgeMeta.fromNetwork ||
      !bridgeMeta.fromToken ||
      !bridgeMeta.toNetwork ||
      !bridgeMeta.toToken
    ) {
      throw new Error("Missing bridge metadata required to validate squidRouter input balance");
    }

    const evmEphemeralAddress = state.state.evmEphemeralAddress;
    if (!evmEphemeralAddress) {
      throw new Error("Missing EVM ephemeral address to validate squidRouter input balance");
    }

    const sourceNetwork = bridgeMeta.fromNetwork as EvmNetworks;
    const sourceTokenDetails = Object.values(evmTokenConfig[sourceNetwork] || {}).find(
      token => token.erc20AddressSourceChain.toLowerCase() === bridgeMeta.fromToken.toLowerCase()
    ) as EvmTokenDetails | undefined;

    if (!sourceTokenDetails) {
      throw new Error(
        `Could not resolve source token details on ${bridgeMeta.fromNetwork} for token ${bridgeMeta.fromToken} in squidRouter phase`
      );
    }

    try {
      try {
        await checkEvmBalanceForToken({
          amountDesiredRaw: bridgeMeta.inputAmountRaw,
          chain: sourceNetwork,
          intervalMs: 1000,
          ownerAddress: evmEphemeralAddress,
          timeoutMs: 15000,
          tokenDetails: sourceTokenDetails
        });
      } catch (_error) {
        throw this.createRecoverableError(
          `Unable to verify squidRouter input balance for ${evmEphemeralAddress} on ${sourceNetwork}; balance may not be settled yet`
        );
      }

      const approveTransaction = this.getPresignedTransaction(state, "squidRouterApprove");
      const swapTransaction = this.getPresignedTransaction(state, "squidRouterSwap");

      if (!approveTransaction || !swapTransaction) {
        throw new Error("Missing presigned transactions for squidRouter phase");
      }

      let approveHash = state.state.squidRouterApproveHash;
      if (!approveHash) {
        const accountNonce = await this.getNonce(sourceNetwork, approveTransaction.signer as `0x${string}`);
        if (approveTransaction.nonce && approveTransaction.nonce !== accountNonce) {
          logger.warn(
            `Nonce mismatch for approve transaction of account ${approveTransaction.signer}: expected ${accountNonce}, got ${approveTransaction.nonce}`
          );
        }

        approveHash = await this.executeTransaction(sourceNetwork, approveTransaction.txData as string);
        logger.info(`Approve transaction executed with hash: ${approveHash}`);

        await state.update({
          state: {
            ...state.state,
            squidRouterApproveHash: approveHash
          }
        });
      }

      await this.waitForTransactionConfirmation(sourceNetwork, approveHash);
      logger.info(`Approve transaction confirmed: ${approveHash}`);

      const swapHash = await this.executeTransaction(sourceNetwork, swapTransaction.txData as string);
      logger.info(`Swap transaction executed with hash: ${swapHash}`);

      let updatedState = await state.update({
        state: {
          ...state.state,
          squidRouterSwapHash: swapHash
        }
      });

      await this.waitForTransactionConfirmation(sourceNetwork, swapHash);
      logger.info(`Swap transaction confirmed: ${swapHash}`);

      // Snapshot the destination-token balance so finalSettlementSubsidy can compute the actual
      // bridge delivery rather than the total balance (which may include leftover dust).
      let preSettlementBalance = "0";
      try {
        const destinationNetwork = quote.network as EvmNetworks;
        const outTokenDetails = getOnChainTokenDetails(quote.network, quote.outputCurrency);

        if (!outTokenDetails || !isEvmTokenDetails(outTokenDetails)) {
          throw new Error(`Could not resolve destination token details for ${quote.outputCurrency} on ${destinationNetwork}`);
        }

        preSettlementBalance = (
          await getEvmBalance({
            chain: destinationNetwork,
            ownerAddress: state.state.evmEphemeralAddress as `0x${string}`,
            tokenDetails: outTokenDetails
          })
        ).toString();
      } catch (error) {
        logger.warn(
          `SquidRouterSwapExecutor: Failed to snapshot pre-settlement balance for ramp ${state.id}; storing 0. Error: ${error}`
        );
      }

      updatedState = await updatedState.update({
        state: {
          ...updatedState.state,
          preSettlementBalance
        }
      });

      return updatedState;
    } catch (error) {
      logger.error(`Error in squidRouter phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  private async executeTransaction(network: EvmNetworks, txData: string): Promise<string> {
    try {
      const publicClient = EvmClientManager.getInstance().getClient(network);
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: txData as `0x${string}`
      });
      return txHash;
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      throw new Error("Failed to send transaction");
    }
  }

  private async waitForTransactionConfirmation(network: EvmNetworks, txHash: string): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 30000; // 30 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const publicClient = EvmClientManager.getInstance().getClient(network);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SquidRouterSwapExecutor: Transaction ${txHash} failed or was not found`);
        }

        return;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isTransactionNotFoundError =
          error instanceof Error &&
          (error.message.includes("TransactionReceiptNotFoundError") ||
            error.message.includes("could not be found") ||
            error.message.includes("Transaction may not be processed"));

        if (isLastAttempt) {
          throw new Error(
            `SquidRouterSwapExecutor: Error waiting for transaction confirmation after ${maxRetries + 1} attempts: ${error}`
          );
        }

        if (isTransactionNotFoundError) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

          logger.info(
            `SquidRouterSwapExecutor: Transaction ${txHash} not found on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${delay}ms...`
          );

          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw this.createRecoverableError(`SquidRouterSwapExecutor: Error waiting for transaction confirmation: ${error}`);
        }
      }
    }
  }

  private async getNonce(network: EvmNetworks, address: `0x${string}`): Promise<number> {
    try {
      const publicClient = EvmClientManager.getInstance().getClient(network);
      return await publicClient.getTransactionCount({ address });
    } catch (error) {
      logger.error("Error getting nonce", error);
      throw this.createRecoverableError("Failed to get transaction nonce");
    }
  }
}

// Port of the production SquidRouterPayPhaseHandler with a single network-generic Axelar gas
// funding method instead of one per chain. Clients are created lazily (no work at import time).
export class SquidRouterPayExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "squidRouterPay";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    logger.info(`Executing squidRouterPay phase for ramp ${state.id}`);

    try {
      const bridgeCallHash = state.state.squidRouterSwapHash;
      if (!bridgeCallHash) {
        throw new Error("SquidRouterPayExecutor: Missing bridge hash in state for squidRouterPay phase. State corrupted.");
      }

      await this.checkStatus(state, bridgeCallHash, quote);

      return state;
    } catch (error: unknown) {
      logger.error(`SquidRouterPayExecutor: Error in squidRouterPay phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  // Checks the Axelar bridge status and the destination balance in parallel; either one
  // succeeding is a success. Only if both fail (timeout) we throw.
  private async checkStatus(state: RampState, swapHash: string, quote: QuoteTicket): Promise<void> {
    const toChain = this.resolveBridgeToChain(quote);

    if (!toChain || !isNetworkEVM(toChain)) {
      logger.info("SquidRouterPayExecutor: Destination network is non-EVM; skipping EVM balance check optimization.", {
        toNetwork: quote.to
      });
      await this.checkBridgeStatus(state, swapHash, quote);
      return;
    }

    let balanceCheckPromise: Promise<Big>;

    try {
      const outTokenDetails = getOnChainTokenDetails(toChain, quote.outputCurrency as OnChainToken) as EvmTokenDetails;
      const ephemeralAddress = state.state.evmEphemeralAddress;

      if (outTokenDetails && ephemeralAddress) {
        balanceCheckPromise = checkEvmBalanceForToken({
          amountDesiredRaw: "1", // A stricter target might time out if the bridge slipped and delivered slightly less.
          chain: toChain,
          intervalMs: BALANCE_POLLING_TIME_MS,
          ownerAddress: ephemeralAddress,
          timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
          tokenDetails: outTokenDetails
        });
      } else {
        logger.warn(
          "SquidRouterPayExecutor: Cannot perform balance check optimization (missing expected token details or address)."
        );
        balanceCheckPromise = Promise.reject(new Error("Skipped balance check"));
      }
    } catch (err) {
      logger.warn(`SquidRouterPayExecutor: Error preparing balance check: ${err}`);
      balanceCheckPromise = Promise.reject(err);
    }

    const bridgeCheckPromise = this.checkBridgeStatus(state, swapHash, quote).catch(err => {
      throw err;
    });

    const balanceCheckWithErrorHandling = balanceCheckPromise.catch(err => {
      throw err;
    });

    try {
      await Promise.any([bridgeCheckPromise, balanceCheckWithErrorHandling]);
    } catch (error) {
      if (error instanceof AggregateError) {
        const balanceError = error.errors.find(e => e instanceof BalanceCheckError);
        const bridgeError = error.errors.find(e => !(e instanceof BalanceCheckError));

        let errorMessage = "SquidRouterPayExecutor: Both bridge status check and balance check failed.";

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

  private async checkBridgeStatus(state: RampState, swapHash: string, quote: QuoteTicket): Promise<void> {
    let isExecuted = false;
    let payTxHash: string | undefined = state.state.squidRouterPayTxHash;

    await new Promise(resolve => setTimeout(resolve, SQUIDROUTER_INITIAL_DELAY_MS));

    while (!isExecuted) {
      try {
        const squidRouterStatus = await this.getSquidrouterStatus(swapHash, state, quote);

        if (!squidRouterStatus) {
          logger.warn(`SquidRouterPayExecutor: No squidRouter status found for swap hash ${swapHash}.`);
        } else if (squidRouterStatus.status === "success") {
          logger.info(`SquidRouterPayExecutor: Transaction ${swapHash} successfully executed on Squidrouter.`);
          isExecuted = true;
          break;
        }

        const isGmp = squidRouterStatus ? squidRouterStatus.isGMPTransaction : true;

        if (isGmp) {
          const axelarScanStatus = await getStatusAxelarScan(swapHash);

          if (!axelarScanStatus) {
            logger.info(`SquidRouterPayExecutor: Axelar status not found yet for hash ${swapHash}.`);
          } else if (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed") {
            logger.info(`SquidRouterPayExecutor: Transaction ${swapHash} successfully executed on Axelar.`);
            isExecuted = true;
            break;
          } else if (!payTxHash) {
            logger.info("SquidRouterPayExecutor: Bridge transaction detected on Axelar. Proceeding to fund gas.");

            const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
            const logIndex = Number(axelarScanStatus.id.split("_")[2]);

            const fromChain = (quote.metadata.evmToEvm?.fromNetwork as EvmNetworks) ?? Networks.Base;

            payTxHash = await this.executeFundTransaction(fromChain, nativeToFundRaw, swapHash as `0x${string}`, logIndex);

            const subsidyToken = fromChain === Networks.Polygon ? SubsidyToken.MATIC : SubsidyToken.ETH;
            const payerAccount = getEvmFundingAccount(fromChain).address;
            const subsidyAmount = nativeToDecimal(nativeToFundRaw, 18).toNumber();

            await this.createSubsidy(state, subsidyAmount, subsidyToken, payerAccount, payTxHash);

            await state.update({
              state: { ...state.state, squidRouterPayTxHash: payTxHash }
            });
          }
        } else {
          logger.info("SquidRouterPayExecutor: Same-chain transaction detected. Skipping Axelar check.");
        }
      } catch (error) {
        throw this.createRecoverableError(
          `SquidRouterPayExecutor: Failed to check bridge status for ${swapHash}, error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, AXELAR_POLLING_INTERVAL_MS));
    }
  }

  private async executeFundTransaction(
    fromChain: EvmNetworks,
    tokenValueRaw: string,
    swapHash: `0x${string}`,
    logIndex: number
  ): Promise<Hash> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const fundingAccount = getEvmFundingAccount(fromChain);
      const walletClient = evmClientManager.getWalletClient(fromChain, fundingAccount);
      const publicClient = evmClientManager.getClient(fromChain);

      const walletClientAccount = walletClient.account;
      if (!walletClientAccount) {
        throw new Error(`SquidRouterPayExecutor: ${fromChain} wallet client account not found.`);
      }

      const transactionData = encodeFunctionData({
        abi: axelarGasServiceAbi,
        args: [swapHash, logIndex, walletClientAccount.address],
        functionName: "addNativeGas"
      });

      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

      const gasPaymentHash = await walletClient.sendTransaction({
        account: walletClientAccount,
        chain: publicClient.chain,
        data: transactionData,
        maxFeePerGas: maxFeePerGas * 2n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 2n,
        to: AXL_GAS_SERVICE_EVM as `0x${string}`,
        value: BigInt(tokenValueRaw)
      });

      logger.info(`SquidRouterPayExecutor: ${fromChain} fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error(`SquidRouterPayExecutor: Error funding gas to Axelar gas service on ${fromChain}: `, error);
      throw new Error(`SquidRouterPayExecutor: Failed to send ${fromChain} transaction`);
    }
  }

  private async getSquidrouterStatus(swapHash: string, state: RampState, quote: QuoteTicket): Promise<SquidRouterPayResponse> {
    try {
      const fromChain = quote.metadata.evmToEvm?.fromNetwork as Networks | undefined;
      if (!fromChain) {
        throw new Error("SquidRouterPayExecutor: Missing evmToEvm bridge metadata for status check");
      }
      const fromChainId = getNetworkId(fromChain)?.toString();
      // Axelar routes through Moonbeam for AssetHub destinations, so the Squid status API
      // expects Moonbeam's chain id when the destination is AssetHub.
      const resolvedToChain = this.resolveBridgeToChain(quote);
      const toChain = resolvedToChain === Networks.AssetHub ? Networks.Moonbeam : resolvedToChain;
      const toChainId = toChain ? getNetworkId(toChain)?.toString() : undefined;

      if (!fromChainId || !toChainId) {
        throw new Error("SquidRouterPayExecutor: Invalid from or to network for Squidrouter status check");
      }

      const squidRouterStatus = await getStatus(swapHash, fromChainId, toChainId, state.state.squidRouterQuoteId);
      return squidRouterStatus;
    } catch (squidRouterError) {
      logger.warn(
        `SquidRouterPayExecutor: SquidRouter status check failed for swap hash ${swapHash}, attempting Axelar fallback: ${squidRouterError instanceof Error ? squidRouterError.message : String(squidRouterError)}`
      );

      try {
        const axelarScanStatus = await getStatusAxelarScan(swapHash);

        if (!axelarScanStatus) {
          throw new Error(
            `SquidRouterPayExecutor: Axelar scan status not found for swap hash ${swapHash} during fallback attempt.`
          );
        }

        const mappedStatus =
          axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed"
            ? "success"
            : axelarScanStatus.status;

        return {
          id: "",
          isGMPTransaction: true,
          routeStatus: [],
          squidTransactionStatus: "",
          status: mappedStatus
        } as SquidRouterPayResponse;
      } catch (axelarError) {
        logger.error(
          `SquidRouterPayExecutor: Both SquidRouter and Axelar fallback failed for swap hash ${swapHash}. Axelar fallback error: ${axelarError instanceof Error ? axelarError.message : String(axelarError)}`
        );
        throw new Error(`SquidRouterPayExecutor: Failed to fetch Squidrouter status for swap hash ${swapHash}`);
      }
    }
  }

  // For onramps, quote.to is the EVM network the bridge delivers to. For offramps to a payment
  // method, fall back to the bridge metadata recorded at quote time.
  private resolveBridgeToChain(quote: QuoteTicket): Networks | undefined {
    const directNetwork = getNetworkFromDestination(quote.to);
    if (directNetwork) {
      return directNetwork;
    }
    return quote.metadata.evmToEvm?.toNetwork as Networks | undefined;
  }

  private calculateGasFeeInUnits(feeResponse: AxelarScanStatusFees, estimatedGas: string | number): string {
    const baseFeeInUnitsBig = Big(feeResponse.source_base_fee);

    // Execution fee: cost to execute the transaction on the destination chain.
    const estimatedGasBig = Big(estimatedGas);
    const sourceGasPriceBig = Big(feeResponse.source_token.gas_price);

    const executionFeeUnits = estimatedGasBig.mul(sourceGasPriceBig);
    const multiplier = feeResponse.execute_gas_multiplier;
    const executionFeeWithMultiplier = executionFeeUnits.mul(multiplier);

    const totalGasFee = baseFeeInUnitsBig.add(executionFeeWithMultiplier);

    const sourceDecimals = feeResponse.source_token.gas_price_in_units.decimals;
    const totalGasFeeRaw = totalGasFee.mul(Big(10).pow(sourceDecimals));

    return totalGasFeeRaw.lt(0) ? "0" : totalGasFeeRaw.toFixed(0, 0);
  }
}
