import {
  AxelarScanStatusFees,
  AxelarScanStatusResponse,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalanceForToken,
  classifyGmpStatus,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  evmTokenConfig,
  GmpClassification,
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
  recoverAxelarStuckConfirm,
  SquidRouterPayResponse,
  sleep
} from "@vortexfi/shared";
import { Big } from "big.js";
import { QueryTypes } from "sequelize";
import { encodeFunctionData, Hash } from "viem";
import logger from "../../../../../../config/logger";
import { axelarGasServiceAbi } from "../../../../../../contracts/AxelarGasService";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { SquidRouterDeliveryEvidence, StateMetadata } from "../../../../phases/meta-state-types";
import { getSquidRouterPayStuckAlertMs, getSquidRouterPayTimeoutMs } from "../../../../phases/phase-processor-config";
import { SlackNotifier } from "../../../../slack.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { getEvmFundingAccount, runSerializedEvmFundingOperation } from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import { settlementBalanceKey } from "../../core/settlement";
import { SquidRouterSwapContext } from "./simulation";

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const SQUIDROUTER_INITIAL_DELAY_MS = 60000; // 60 seconds
const AXL_GAS_SERVICE_EVM = "0x2d5d7d31F671F86C782533cc367F14109a082712";
const BALANCE_POLLING_TIME_MS = 10000;
const DEFAULT_SQUIDROUTER_GAS_ESTIMATE = "1600000";
const AXELAR_CONFIRM_RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;
const STUCK_ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;
const EXTRA_GAS_PENDING_MARKER = "pending";
const STATUS_REQUEST_TIMEOUT_MS = 30000;
const DESTINATION_BALANCE_FALLBACK_MIN_RATIO_BPS = 9000;

type TerminalBridgeEvidence = Pick<SquidRouterDeliveryEvidence, "kind" | "observedAt" | "provider" | "providerStatus">;

type SquidRouterStatusWithSource = SquidRouterPayResponse & {
  evidenceProvider: "axelar" | "squid";
};

// Port of the production SquidRouterPhaseHandler for block-owned bridge and passthrough routes.
export class SquidRouterSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "squidRouterSwap";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    logger.info(`Executing squidRouter phase for ramp ${state.id}`);

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const bridgeMeta = getBlockMetadata(quote.metadata, SquidRouterSwapContext);

    if (
      bridgeMeta.fromNetwork === bridgeMeta.toNetwork &&
      bridgeMeta.fromToken.toLowerCase() === bridgeMeta.toToken.toLowerCase()
    ) {
      const evmEphemeralAddress = state.state.evmEphemeralAddress;
      if (!evmEphemeralAddress) {
        throw new Error("Missing EVM ephemeral address for squidRouter passthrough");
      }
      const tokenDetails = getOnChainTokenDetails(bridgeMeta.toNetwork, quote.outputCurrency as OnChainToken);
      if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
        throw new Error(`Could not resolve passthrough token details on ${bridgeMeta.toNetwork}`);
      }
      const baselineKey = settlementBalanceKey(bridgeMeta.toNetwork, evmEphemeralAddress, tokenDetails.erc20AddressSourceChain);
      await state.update({
        state: {
          ...state.state,
          transactionPlan: {
            ...state.state.transactionPlan,
            settlementBaselines: {
              ...state.state.transactionPlan?.settlementBaselines,
              [baselineKey]: "0"
            }
          }
        }
      });
      logger.info(`SquidRouterSwapExecutor: Skipping same-chain same-token passthrough for ramp ${state.id}`);
      return state;
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
          signal,
          timeoutMs: 15000,
          tokenDetails: sourceTokenDetails
        });
      } catch (_error) {
        throwIfAborted(signal);
        throw this.createRecoverableError(
          `Unable to verify squidRouter input balance for ${evmEphemeralAddress} on ${sourceNetwork}; balance may not be settled yet`
        );
      }

      const approveTransaction = this.getPresignedTransaction(state, "squidRouterApprove");
      const swapTransaction = this.getPresignedTransaction(state, "squidRouterSwap");

      if (!approveTransaction || !swapTransaction) {
        throw new Error("Missing presigned transactions for squidRouter phase");
      }

      const destinationNetwork = bridgeMeta.toNetwork as EvmNetworks;
      const destinationTokenDetails = getOnChainTokenDetails(destinationNetwork, quote.outputCurrency as OnChainToken);
      if (!destinationTokenDetails || !isEvmTokenDetails(destinationTokenDetails)) {
        throw new Error(`Could not resolve destination token details on ${destinationNetwork}`);
      }
      const baselineKey = settlementBalanceKey(
        destinationNetwork,
        evmEphemeralAddress,
        destinationTokenDetails.erc20AddressSourceChain
      );
      if (state.state.transactionPlan?.settlementBaselines?.[baselineKey] === undefined) {
        const baseline = await abortableCall(signal, () =>
          getEvmBalance({
            chain: destinationNetwork,
            ownerAddress: evmEphemeralAddress as `0x${string}`,
            tokenDetails: destinationTokenDetails
          })
        );
        await state.update({
          state: {
            ...state.state,
            transactionPlan: {
              ...state.state.transactionPlan,
              settlementBaselines: {
                ...state.state.transactionPlan?.settlementBaselines,
                [baselineKey]: baseline.toFixed(0)
              }
            }
          }
        });
      }

      let approveHash = state.state.squidRouterApproveHash;
      if (!approveHash) {
        const accountNonce = await this.getNonce(sourceNetwork, approveTransaction.signer as `0x${string}`, signal);
        if (approveTransaction.nonce && approveTransaction.nonce !== accountNonce) {
          logger.warn(
            `Nonce mismatch for approve transaction of account ${approveTransaction.signer}: expected ${accountNonce}, got ${approveTransaction.nonce}`
          );
        }

        approveHash = await this.executeTransaction(
          state,
          sourceNetwork,
          approveTransaction.txData as string,
          "approve-broadcast",
          signal
        );
        logger.info(`Approve transaction executed with hash: ${approveHash}`);

        await state.update({
          state: {
            ...state.state,
            squidRouterApproveHash: approveHash
          }
        });
      }

      await this.waitForTransactionConfirmation(sourceNetwork, approveHash, signal);
      logger.info(`Approve transaction confirmed: ${approveHash}`);

      let swapHash = state.state.squidRouterSwapHash;
      let updatedState = state;
      if (!swapHash) {
        swapHash = await this.executeTransaction(
          state,
          sourceNetwork,
          swapTransaction.txData as string,
          "swap-broadcast",
          signal
        );
        logger.info(`Swap transaction executed with hash: ${swapHash}`);

        updatedState = await state.update({
          state: {
            ...state.state,
            squidRouterSwapHash: swapHash
          }
        });
      }

      await this.waitForTransactionConfirmation(sourceNetwork, swapHash, signal);
      logger.info(`Swap transaction confirmed: ${swapHash}`);

      return updatedState;
    } catch (error) {
      logger.error(`Error in squidRouter phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  private async executeTransaction(
    state: RampState,
    network: EvmNetworks,
    txData: string,
    attemptClass: string,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      const publicClient = EvmClientManager.getInstance().getClient(network);
      const { hash } = await this.runFinancialOperation(state, {
        attemptClass,
        externalId: operation => operation.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await abortableCall(signal, () =>
            publicClient.sendRawTransaction({
              serializedTransaction: txData as `0x${string}`
            })
          );
          const receipt = await abortableCall(signal, () => publicClient.waitForTransactionReceipt({ hash }));
          if (receipt.status !== "success") {
            throw new FinancialOperationRejectedError(`Squid Router transaction ${hash} failed`);
          }
          return { hash };
        },
        provider: network,
        request: { network, signedTransaction: txData },
        signal
      });
      return hash;
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      if (error instanceof PhaseError) throw error;
      throw new Error("Failed to send transaction");
    }
  }

  private async waitForTransactionConfirmation(network: EvmNetworks, txHash: string, signal?: AbortSignal): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 30000; // 30 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const publicClient = EvmClientManager.getInstance().getClient(network);
        const receipt = await abortableCall(signal, () =>
          publicClient.waitForTransactionReceipt({
            hash: txHash as `0x${string}`
          })
        );

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SquidRouterSwapExecutor: Transaction ${txHash} failed or was not found`);
        }

        return;
      } catch (error) {
        throwIfAborted(signal);
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

          await sleep(delay, signal);
        } else {
          throw this.createRecoverableError(`SquidRouterSwapExecutor: Error waiting for transaction confirmation: ${error}`);
        }
      }
    }
  }

  private async getNonce(network: EvmNetworks, address: `0x${string}`, signal?: AbortSignal): Promise<number> {
    try {
      const publicClient = EvmClientManager.getInstance().getClient(network);
      return await abortableCall(signal, () => publicClient.getTransactionCount({ address }));
    } catch (error) {
      logger.error("Error getting nonce", error);
      throw this.createRecoverableError("Failed to get transaction nonce");
    }
  }
}

// Port of the production SquidRouterPayPhaseHandler with a single network-generic Axelar gas
// funding method instead of one per chain. Clients are created lazily (no work at import time).
export class SquidRouterPayExecutor extends BasePhaseHandler {
  // Instance fields allow focused tests to avoid production polling delays.
  private initialDelayMs = SQUIDROUTER_INITIAL_DELAY_MS;
  private pollIntervalMs = AXELAR_POLLING_INTERVAL_MS;
  private stuckAlertThresholdMs?: number;
  private slackNotifier?: SlackNotifier | null;

  public getPhaseName(): RampPhase {
    return "squidRouterPay";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
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

      await this.checkStatus(state, bridgeCallHash, quote, signal);

      return state;
    } catch (error: unknown) {
      logger.error(`SquidRouterPayExecutor: Error in squidRouterPay phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  // Prefer authoritative provider-terminal status. An exact route-scoped destination
  // balance delta remains a fallback because provider indexing can miss a real arrival.
  // Whichever succeeds is persisted so downstream subsidy logic cannot silently change
  // the meaning of "bridge complete".
  private async checkStatus(state: RampState, swapHash: string, quote: QuoteTicket, signal?: AbortSignal): Promise<void> {
    const toChain = this.resolveBridgeToChain(quote);
    const pollingTimeoutMs = getSquidRouterPayTimeoutMs();
    const bridgeMeta = getBlockMetadata(quote.metadata, SquidRouterSwapContext);

    if (!toChain || !isNetworkEVM(toChain)) {
      logger.info("SquidRouterPayExecutor: Destination network is non-EVM; skipping EVM balance check optimization.", {
        toNetwork: quote.to
      });
      const terminal = await this.checkBridgeStatus(state, swapHash, quote, pollingTimeoutMs, signal);
      await this.persistDeliveryEvidence(state, {
        ...terminal,
        destinationNetwork: bridgeMeta.toNetwork,
        destinationToken: bridgeMeta.toToken,
        expectedAmountRaw: bridgeMeta.outputAmountRaw,
        sourceTransactionHash: swapHash
      });
      return;
    }

    const competingCheckController = new AbortController();
    const competingSignal = signal
      ? AbortSignal.any([signal, competingCheckController.signal])
      : competingCheckController.signal;
    let balanceCheckPromise: Promise<SquidRouterDeliveryEvidence>;

    try {
      const outTokenDetails = getOnChainTokenDetails(toChain, quote.outputCurrency as OnChainToken) as EvmTokenDetails;
      const ephemeralAddress = state.state.evmEphemeralAddress;

      if (outTokenDetails && ephemeralAddress) {
        const baselineKey = settlementBalanceKey(toChain, ephemeralAddress, outTokenDetails.erc20AddressSourceChain);
        const baselineRaw = state.state.transactionPlan?.settlementBaselines?.[baselineKey];
        if (baselineRaw === undefined) {
          throw new Error(`Missing destination settlement baseline ${baselineKey}`);
        }
        const minimumDeliveryRaw = new Big(bridgeMeta.outputAmountRaw)
          .mul(DESTINATION_BALANCE_FALLBACK_MIN_RATIO_BPS)
          .div(10_000)
          .toFixed(0, 0);
        balanceCheckPromise = checkEvmBalanceForToken({
          amountDesiredRaw: new Big(baselineRaw).plus(minimumDeliveryRaw).toFixed(0),
          chain: toChain,
          intervalMs: BALANCE_POLLING_TIME_MS,
          ownerAddress: ephemeralAddress,
          signal: competingSignal,
          timeoutMs: pollingTimeoutMs,
          tokenDetails: outTokenDetails
        }).then(observedBalance => ({
          baselineRaw,
          destinationNetwork: bridgeMeta.toNetwork,
          destinationToken: bridgeMeta.toToken,
          expectedAmountRaw: bridgeMeta.outputAmountRaw,
          kind: "destination-balance",
          minimumRatioBps: DESTINATION_BALANCE_FALLBACK_MIN_RATIO_BPS,
          observedAt: new Date().toISOString(),
          observedBalanceRaw: observedBalance.toFixed(0),
          sourceTransactionHash: swapHash
        }));
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

    const bridgeCheckPromise = this.checkBridgeStatus(state, swapHash, quote, pollingTimeoutMs, competingSignal).then(
      terminal => ({
        ...terminal,
        destinationNetwork: bridgeMeta.toNetwork,
        destinationToken: bridgeMeta.toToken,
        expectedAmountRaw: bridgeMeta.outputAmountRaw,
        sourceTransactionHash: swapHash
      })
    );

    try {
      const evidence = await Promise.any([bridgeCheckPromise, balanceCheckPromise]);
      competingCheckController.abort(new Error("Alternative Squid completion check succeeded"));
      await this.persistDeliveryEvidence(state, evidence);
    } catch (error) {
      if (error instanceof AggregateError) {
        const balanceError = error.errors.find(e => e instanceof BalanceCheckError);
        const bridgeError = error.errors.find(e => !(e instanceof BalanceCheckError));

        let errorMessage = "SquidRouterPayExecutor: Both bridge status check and balance check failed.";

        if (balanceError instanceof BalanceCheckError) {
          if (balanceError.type === BalanceCheckErrorType.Timeout) {
            errorMessage += ` Balance check timed out after ${pollingTimeoutMs}ms.`;
          } else if (balanceError.type === BalanceCheckErrorType.ReadFailure) {
            errorMessage += ` Balance check read failure (unexpected infrastructure issue): ${balanceError.message}.`;
          }
        }

        if (bridgeError) {
          errorMessage += ` Bridge check error: ${bridgeError instanceof Error ? bridgeError.message : String(bridgeError)}.`;
        }

        throw this.createRecoverableError(errorMessage);
      }
      throw error;
    } finally {
      competingCheckController.abort(new Error("Squid completion check finished"));
    }
  }

  private async checkBridgeStatus(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    timeoutMs = getSquidRouterPayTimeoutMs(),
    signal?: AbortSignal
  ): Promise<TerminalBridgeEvidence> {
    let payTxHash: string | undefined = state.state.squidRouterPayTxHash;
    const timeoutAt = Date.now() + timeoutMs;

    await sleep(Math.min(this.initialDelayMs, timeoutMs), signal);

    while (true) {
      if (Date.now() >= timeoutAt) {
        throw this.createRecoverableError(`SquidRouterPayExecutor: Bridge status check timed out after ${timeoutMs}ms`);
      }

      let fundedThisIteration = false;
      let lastAxelarScanStatus: AxelarScanStatusResponse | undefined;
      let recoveryOutcome: string | undefined;

      try {
        const squidRouterStatus = await this.getSquidrouterStatus(swapHash, state, quote, signal);

        if (!squidRouterStatus) {
          logger.warn(`SquidRouterPayExecutor: No squidRouter status found for swap hash ${swapHash}.`);
        } else if (squidRouterStatus.status === "success") {
          logger.info(`SquidRouterPayExecutor: Transaction ${swapHash} successfully executed on Squidrouter.`);
          return {
            kind: "provider-terminal",
            observedAt: new Date().toISOString(),
            provider: squidRouterStatus.evidenceProvider,
            providerStatus: "success"
          };
        }

        const isGmp = squidRouterStatus ? squidRouterStatus.isGMPTransaction : true;

        if (isGmp) {
          const axelarScanStatus = await getStatusAxelarScan(swapHash, this.statusRequestSignal(signal));
          lastAxelarScanStatus = axelarScanStatus ?? undefined;

          if (!axelarScanStatus) {
            logger.info(`SquidRouterPayExecutor: Axelar status not found yet for hash ${swapHash}.`);
          } else if (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed") {
            logger.info(`SquidRouterPayExecutor: Transaction ${swapHash} successfully executed on Axelar.`);
            return {
              kind: "provider-terminal",
              observedAt: new Date().toISOString(),
              provider: "axelar",
              providerStatus: axelarScanStatus.status
            };
          } else if (!payTxHash) {
            logger.info("SquidRouterPayExecutor: Bridge transaction detected on Axelar. Proceeding to fund gas.");
            fundedThisIteration = true;

            const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
            const logIndex = Number(axelarScanStatus.id.split("_")[2]);

            const fromChain = getBlockMetadata(quote.metadata, SquidRouterSwapContext).fromNetwork as EvmNetworks;

            payTxHash = await this.executeFundTransaction(
              state,
              fromChain,
              nativeToFundRaw,
              swapHash as `0x${string}`,
              logIndex,
              "initial-gas-payment",
              signal
            );

            const subsidyToken = fromChain === Networks.Polygon ? SubsidyToken.MATIC : SubsidyToken.ETH;
            const payerAccount = getEvmFundingAccount(fromChain).address;
            const subsidyAmount = nativeToDecimal(nativeToFundRaw, 18).toNumber();

            await this.createSubsidy(state, subsidyAmount, subsidyToken, payerAccount, payTxHash);

            await this.patchStateKey(state, "squidRouterPayTxHash", payTxHash);
          } else if (axelarScanStatus.status === "called" && axelarScanStatus.confirm_failed) {
            recoveryOutcome = await this.maybeRecoverStuckConfirm(state, swapHash, axelarScanStatus.call?.chain, signal);
          }

          if (!fundedThisIteration) {
            await this.monitorStuckGmp(state, swapHash, quote, axelarScanStatus ?? undefined, signal, { recoveryOutcome });
          }
        } else {
          logger.info("SquidRouterPayExecutor: Same-chain transaction detected. Skipping Axelar check.");
        }
      } catch (error) {
        await this.monitorStuckGmp(state, swapHash, quote, lastAxelarScanStatus, signal, { lastError: error, recoveryOutcome });
        throw this.createRecoverableError(
          `SquidRouterPayExecutor: Failed to check bridge status for ${swapHash}, error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await sleep(this.pollIntervalMs, signal);
    }
  }

  private statusRequestSignal(signal?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS);
    return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  }

  private async patchStateKey<K extends keyof StateMetadata & string>(
    state: RampState,
    key: K,
    value: StateMetadata[K],
    guardSql = "TRUE",
    guardReplacements: Record<string, unknown> = {}
  ): Promise<number> {
    const sequelizeInstance = RampState.sequelize;
    if (!sequelizeInstance) {
      throw new Error("SquidRouterPayExecutor: RampState model is not attached to a sequelize instance");
    }
    const [, affectedRows] = await sequelizeInstance.query(
      `UPDATE ramp_states SET state = jsonb_set(state, '{${key}}', :patchValue::jsonb), updated_at = NOW() WHERE id = :rampId AND (${guardSql})`,
      {
        replacements: { patchValue: JSON.stringify(value), rampId: state.id, ...guardReplacements },
        type: QueryTypes.UPDATE
      }
    );
    const updatedRows = typeof affectedRows === "number" ? affectedRows : 0;
    if (updatedRows > 0) {
      state.state = { ...state.state, [key]: value };
    }
    return updatedRows;
  }

  private async persistDeliveryEvidence(state: RampState, evidence: SquidRouterDeliveryEvidence): Promise<void> {
    await this.patchStateKey(state, "squidRouterDeliveryEvidence", evidence);
    logger.info("SQUIDROUTER_DELIVERY_EVIDENCE", {
      destinationNetwork: evidence.destinationNetwork,
      expectedAmountRaw: evidence.expectedAmountRaw,
      kind: evidence.kind,
      minimumRatioBps: evidence.minimumRatioBps,
      provider: evidence.provider,
      rampId: state.id,
      sourceTransactionHash: evidence.sourceTransactionHash
    });
  }

  private async maybeRecoverStuckConfirm(
    state: RampState,
    swapHash: string,
    sourceChain: string | undefined,
    signal?: AbortSignal
  ): Promise<string> {
    const parsedLastAttempt = state.state.axelarConfirmRecoveryAt ? new Date(state.state.axelarConfirmRecoveryAt).getTime() : 0;
    const lastAttempt = Number.isFinite(parsedLastAttempt) ? parsedLastAttempt : 0;
    if (Date.now() - lastAttempt < AXELAR_CONFIRM_RECOVERY_COOLDOWN_MS) {
      return `confirm recovery on cooldown (last attempt ${new Date(lastAttempt).toISOString()})`;
    }

    if (!sourceChain) {
      logger.warn(
        `SquidRouterPayExecutor: Confirm poll failed for ${swapHash} but Axelar status has no source chain; cannot attempt recovery.`
      );
      return "confirm recovery unavailable: Axelar status has no source chain";
    }

    await this.patchStateKey(state, "axelarConfirmRecoveryAt", new Date().toISOString());

    try {
      const axelarTxHash = await recoverAxelarStuckConfirm(swapHash, sourceChain, signal);
      logger.info(
        `SquidRouterPayExecutor: Confirm poll failed for ${swapHash}; broadcast recovery ConfirmGatewayTx ${axelarTxHash} on Axelar.`
      );
      return `broadcast recovery ConfirmGatewayTx ${axelarTxHash} on Axelar`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`SquidRouterPayExecutor: Axelar stuck-confirm recovery attempt failed for ${swapHash}: ${message}`);
      return `confirm recovery attempt failed: ${message}`;
    }
  }

  private getElapsedInPhaseMs(state: RampState): number {
    const entry = [...(state.phaseHistory ?? [])].reverse().find(e => e.phase === "squidRouterPay");
    const startIso = entry?.timestamp ?? state.createdAt;
    const start = startIso ? new Date(startIso).getTime() : Number.NaN;
    return Number.isFinite(start) ? Date.now() - start : 0;
  }

  private async monitorStuckGmp(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    axelarScanStatus: AxelarScanStatusResponse | undefined,
    signal?: AbortSignal,
    context: { lastError?: unknown; recoveryOutcome?: string } = {}
  ): Promise<void> {
    try {
      if (signal?.aborted) {
        return;
      }

      const elapsedMs = this.getElapsedInPhaseMs(state);
      if (elapsedMs < (this.stuckAlertThresholdMs ?? getSquidRouterPayStuckAlertMs())) {
        return;
      }

      const classification = classifyGmpStatus(axelarScanStatus);
      if (classification === "executed") {
        return;
      }

      let actionTaken = "none";
      if (classification === "insufficient_gas") {
        actionTaken = await this.maybeTopUpGas(state, swapHash, quote, axelarScanStatus, signal);
      } else if (classification === "waiting_source_confirmation" || classification === "source_confirmation_stuck") {
        actionTaken =
          context.recoveryOutcome ??
          (await this.maybeRecoverStuckConfirm(state, swapHash, axelarScanStatus?.call?.chain, signal));
      }

      await this.alertStuckGmp(
        state,
        swapHash,
        quote,
        classification,
        axelarScanStatus,
        elapsedMs,
        actionTaken,
        context.lastError
      );
    } catch (error) {
      logger.warn(
        `SquidRouterPayExecutor: Stuck-GMP monitor failed for ramp ${state.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async maybeTopUpGas(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    axelarScanStatus: AxelarScanStatusResponse | undefined,
    signal?: AbortSignal
  ): Promise<string> {
    if (!state.state.squidRouterPayTxHash) {
      return "initial gas payment still pending; regular funding flow will pay";
    }
    if (state.state.squidRouterExtraGasTxHash === EXTRA_GAS_PENDING_MARKER) {
      return "gas top-up previously attempted with unknown outcome; not retrying; check the funding wallet's transactions manually";
    }
    if (state.state.squidRouterExtraGasTxHash) {
      return `gas top-up already sent (${state.state.squidRouterExtraGasTxHash}); not topping up again`;
    }
    if (!axelarScanStatus?.fees) {
      return "cannot top up gas: Axelar status has no fee data";
    }
    const logIndex = Number(axelarScanStatus.id?.split("_")[2]);
    if (!Number.isFinite(logIndex)) {
      return `cannot top up gas: malformed Axelar status id "${axelarScanStatus.id}"`;
    }
    if (signal?.aborted) {
      return "execution aborted before gas top-up; not sending";
    }

    const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
    const claimedRows = await this.patchStateKey(
      state,
      "squidRouterExtraGasTxHash",
      EXTRA_GAS_PENDING_MARKER,
      `state->>'squidRouterExtraGasTxHash' IS NULL`
    );
    if (claimedRows === 0) {
      return "gas top-up already claimed by a concurrent execution; not sending";
    }

    const fromChain = getBlockMetadata(quote.metadata, SquidRouterSwapContext).fromNetwork as EvmNetworks;
    const extraGasTxHash = await this.executeFundTransaction(
      state,
      fromChain,
      nativeToFundRaw,
      swapHash as `0x${string}`,
      logIndex,
      "supplemental-gas-payment",
      signal
    );
    await this.patchStateKey(state, "squidRouterExtraGasTxHash", extraGasTxHash);

    logger.warn(
      `SQUIDROUTER_EXTRA_GAS_PAID: supplemental Axelar gas top-up sent. ramp=${state.id} amountRaw=${nativeToFundRaw} tx=${extraGasTxHash}`
    );
    return `sent one-time gas top-up ${extraGasTxHash} (${nativeToDecimal(nativeToFundRaw, 18).toNumber()} native units)`;
  }

  private async alertStuckGmp(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    classification: GmpClassification,
    axelarScanStatus: AxelarScanStatusResponse | undefined,
    elapsedMs: number,
    actionTaken: string,
    lastError?: unknown
  ): Promise<void> {
    const previousAlertAt = state.state.squidRouterStuckAlertedAt;
    const parsedLastAlert = previousAlertAt ? new Date(previousAlertAt).getTime() : 0;
    const lastAlert = Number.isFinite(parsedLastAlert) ? parsedLastAlert : 0;
    if (Date.now() - lastAlert < STUCK_ALERT_REPEAT_MS) {
      return;
    }

    const claimedRows = previousAlertAt
      ? await this.patchStateKey(
          state,
          "squidRouterStuckAlertedAt",
          new Date().toISOString(),
          `state->>'squidRouterStuckAlertedAt' = :previousAlertAt`,
          { previousAlertAt }
        )
      : await this.patchStateKey(
          state,
          "squidRouterStuckAlertedAt",
          new Date().toISOString(),
          `state->>'squidRouterStuckAlertedAt' IS NULL`
        );
    if (claimedRows === 0) {
      return;
    }

    const guidanceByClassification: Record<GmpClassification, string> = {
      executed: "",
      execution_failed: "destination execution failed; external; retry the execution manually from the Axelarscan page",
      insufficient_gas: "Vortex-actionable: Axelar reports the paid gas as insufficient",
      relayer_pending:
        "gas paid and call approved; likely external Axelar/Squid relayer latency; manual execute possible on Axelarscan",
      source_confirmation_stuck: "validator confirm poll failed; auto-recovery attempted; external if it persists",
      unknown: "status unavailable or not indexed; possible Squid/Axelarscan API outage; check the Axelarscan link manually",
      waiting_source_confirmation: "waiting for Axelar source confirmation; auto-recovery attempted; external if it persists"
    };

    const lastErrorLog = state.errorLogs?.[state.errorLogs.length - 1];
    const lastErrorText =
      lastError instanceof Error ? lastError.message : lastError ? String(lastError) : (lastErrorLog?.error ?? "none");
    const squidRouterQuoteId = getBlockState<{ quoteId: string }>(state.state, SquidRouterSwapContext).quoteId;

    const text = [
      `squidRouterPay stuck for ${Math.round(elapsedMs / 60000)} minutes`,
      `- ramp: ${state.id}`,
      `- classification: ${classification} (${guidanceByClassification[classification]})`,
      `- axelar status: ${axelarScanStatus?.status ?? "unavailable"} (confirm_failed=${axelarScanStatus?.confirm_failed ?? "n/a"}, is_insufficient_fee=${axelarScanStatus?.is_insufficient_fee ?? "n/a"}, gas_status=${axelarScanStatus?.gas_status ?? "n/a"})`,
      `- source tx: ${swapHash}`,
      `- squid quote id: ${squidRouterQuoteId}`,
      `- axelarscan: https://axelarscan.io/gmp/${swapHash}`,
      `- gas payment tx: ${state.state.squidRouterPayTxHash ?? "none"}`,
      `- action taken: ${actionTaken}`,
      `- last error: ${lastErrorText}`
    ].join("\n");

    logger.warn(`SQUIDROUTER_PAY_STUCK: ${text}`);

    const notifier = this.getSlackNotifier();
    if (notifier) {
      try {
        await notifier.sendMessage({ text });
      } catch (error) {
        logger.warn(
          `SquidRouterPayExecutor: Failed to send stuck-GMP Slack alert for ramp ${state.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private getSlackNotifier(): SlackNotifier | null {
    if (this.slackNotifier === undefined) {
      try {
        this.slackNotifier = new SlackNotifier();
      } catch {
        logger.warn(
          "SquidRouterPayExecutor: Slack notifier unavailable (SLACK_WEB_HOOK_TOKEN not set); stuck-GMP alerts will only be logged."
        );
        this.slackNotifier = null;
      }
    }
    return this.slackNotifier;
  }

  private async executeFundTransaction(
    state: RampState,
    fromChain: EvmNetworks,
    tokenValueRaw: string,
    swapHash: `0x${string}`,
    logIndex: number,
    attemptClass: string,
    signal?: AbortSignal
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

      const { hash: gasPaymentHash } = await runSerializedEvmFundingOperation(
        fromChain,
        async () => {
          const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
          const nonce = await publicClient.getTransactionCount({ address: walletClientAccount.address, blockTag: "pending" });
          return this.runFinancialOperation(state, {
            attemptClass,
            externalId: operation => operation.hash,
            perform: async () => {
              const hash = await walletClient.sendTransaction({
                account: walletClientAccount,
                chain: publicClient.chain,
                data: transactionData,
                maxFeePerGas: fromChain === Networks.Polygon ? maxFeePerGas : maxFeePerGas * 2n,
                maxPriorityFeePerGas: fromChain === Networks.Polygon ? maxPriorityFeePerGas : maxPriorityFeePerGas * 2n,
                nonce,
                to: AXL_GAS_SERVICE_EVM as `0x${string}`,
                value: BigInt(tokenValueRaw)
              });
              const receipt = await publicClient.waitForTransactionReceipt({ hash });
              if (receipt.status !== "success") {
                throw new FinancialOperationRejectedError(`Axelar gas payment ${hash} failed`);
              }
              return { hash };
            },
            provider: fromChain,
            request: { amountRaw: tokenValueRaw, logIndex, network: fromChain, swapHash },
            settleAfterAbort: true,
            signal
          });
        },
        signal
      );

      logger.info(`SquidRouterPayExecutor: ${fromChain} fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error(`SquidRouterPayExecutor: Error funding gas to Axelar gas service on ${fromChain}: `, error);
      if (error instanceof PhaseError) throw error;
      throw new Error(`SquidRouterPayExecutor: Failed to send ${fromChain} transaction`);
    }
  }

  private async getSquidrouterStatus(
    swapHash: string,
    state: RampState,
    quote: QuoteTicket,
    signal?: AbortSignal
  ): Promise<SquidRouterStatusWithSource> {
    try {
      const fromChain = getBlockMetadata(quote.metadata, SquidRouterSwapContext).fromNetwork;
      const fromChainId = getNetworkId(fromChain)?.toString();
      // Axelar routes through Moonbeam for AssetHub destinations, so the Squid status API
      // expects Moonbeam's chain id when the destination is AssetHub.
      const resolvedToChain = this.resolveBridgeToChain(quote);
      const toChain = resolvedToChain === Networks.AssetHub ? Networks.Moonbeam : resolvedToChain;
      const toChainId = toChain ? getNetworkId(toChain)?.toString() : undefined;

      if (!fromChainId || !toChainId) {
        throw new Error("SquidRouterPayExecutor: Invalid from or to network for Squidrouter status check");
      }

      const squidRouterQuoteId = getBlockState<{ quoteId: string }>(state.state, SquidRouterSwapContext).quoteId;
      const squidRouterStatus = await getStatus(
        swapHash,
        fromChainId,
        toChainId,
        squidRouterQuoteId,
        this.statusRequestSignal(signal)
      );
      return { ...squidRouterStatus, evidenceProvider: "squid" };
    } catch (squidRouterError) {
      logger.warn(
        `SquidRouterPayExecutor: SquidRouter status check failed for swap hash ${swapHash}, attempting Axelar fallback: ${squidRouterError instanceof Error ? squidRouterError.message : String(squidRouterError)}`
      );

      try {
        const axelarScanStatus = await getStatusAxelarScan(swapHash, this.statusRequestSignal(signal));

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
          evidenceProvider: "axelar",
          id: "",
          isGMPTransaction: true,
          routeStatus: [],
          squidTransactionStatus: "",
          status: mappedStatus
        } as SquidRouterStatusWithSource;
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
    return getBlockMetadata(quote.metadata, SquidRouterSwapContext).toNetwork;
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
