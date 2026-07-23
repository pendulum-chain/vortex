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
  FiatToken,
  GmpClassification,
  getNetworkId,
  getOnChainTokenDetails,
  getStatus,
  getStatusAxelarScan,
  isAlfredpayToken,
  Networks,
  nativeToDecimal,
  OnChainToken,
  RampDirection,
  RampPhase,
  recoverAxelarStuckConfirm,
  SquidRouterPayResponse,
  sleep
} from "@vortexfi/shared";
import Big from "big.js";
import { createWalletClient, encodeFunctionData, Hash, PublicClient } from "viem";
import { base, polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { axelarGasServiceAbi } from "../../../../contracts/AxelarGasService";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { SlackNotifier } from "../../slack.service";
import { BasePhaseHandler } from "../base-phase-handler";
import { getEvmFundingAccount } from "../evm-funding";
import { getSquidRouterPayStuckAlertMs, getSquidRouterPayTimeoutMs } from "../phase-processor-config";

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const SQUIDROUTER_INITIAL_DELAY_MS = 60000; // 60 seconds
const AXL_GAS_SERVICE_EVM = "0x2d5d7d31F671F86C782533cc367F14109a082712";
const BALANCE_POLLING_TIME_MS = 10000;
const DEFAULT_SQUIDROUTER_GAS_ESTIMATE = "1600000"; // Estimate used to calculate part of the gas fee for SquidRouter transactions.
// Minimum time between Axelar stuck-confirm recovery broadcasts for the same ramp. A new
// validator poll needs a few minutes to complete, so re-broadcasting sooner is pure noise.
const AXELAR_CONFIRM_RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;
// Minimum time between stuck-GMP alerts for the same ramp, so a multi-hour outage
// produces periodic reminders instead of one alert per 10s poll iteration.
const STUCK_ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;
/**
 * Handler for the squidRouter pay phase. Checks the status of the Axelar bridge and pays on native GLMR fee.
 */
export class SquidRouterPayPhaseHandler extends BasePhaseHandler {
  private moonbeamPublicClient: PublicClient;
  private polygonPublicClient: PublicClient;
  private basePublicClient: PublicClient;
  private moonbeamWalletClient: ReturnType<typeof createWalletClient>;
  private polygonWalletClient: ReturnType<typeof createWalletClient>;
  private baseWalletClient: ReturnType<typeof createWalletClient>;
  // Instance fields (not module constants) so tests can shrink the waits.
  private initialDelayMs = SQUIDROUTER_INITIAL_DELAY_MS;
  private pollIntervalMs = AXELAR_POLLING_INTERVAL_MS;
  // Test override; when unset the env-backed default applies per call.
  private stuckAlertThresholdMs?: number;
  // Lazily created so environments without SLACK_WEB_HOOK_TOKEN (dev, tests) still
  // load the handler; stuck alerts then only go to the logs.
  private slackNotifier?: SlackNotifier | null;

  constructor() {
    super();
    const evmClientManager = EvmClientManager.getInstance();
    this.moonbeamPublicClient = evmClientManager.getClient(Networks.Moonbeam);
    this.polygonPublicClient = evmClientManager.getClient(Networks.Polygon);
    this.basePublicClient = evmClientManager.getClient(Networks.Base);

    const moonbeamExecutorAccount = getEvmFundingAccount(Networks.Moonbeam);
    this.moonbeamWalletClient = evmClientManager.getWalletClient(Networks.Moonbeam, moonbeamExecutorAccount);
    this.polygonWalletClient = evmClientManager.getWalletClient(Networks.Polygon, moonbeamExecutorAccount);
    this.baseWalletClient = evmClientManager.getWalletClient(Networks.Base, moonbeamExecutorAccount);
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
  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
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
      await this.checkStatus(state, bridgeCallHash, quote, signal);

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
  private async checkStatus(state: RampState, swapHash: string, quote: QuoteTicket, signal?: AbortSignal): Promise<void> {
    const pollingTimeoutMs = getSquidRouterPayTimeoutMs();

    // If the destination is not an EVM network, skip the EVM balance optimization and rely on bridge status only.
    if (quote.to === Networks.AssetHub) {
      logger.info("SquidRouterPayPhaseHandler: Destination network is non-EVM; skipping EVM balance check optimization.", {
        toNetwork: quote.to
      });
      await this.checkBridgeStatus(state, swapHash, quote, pollingTimeoutMs, signal);
      return;
    }

    const toChain = quote.to as EvmNetworks;

    let balanceCheckPromise: Promise<Big>;

    try {
      const outTokenDetails = getOnChainTokenDetails(toChain, quote.outputCurrency as OnChainToken) as EvmTokenDetails;
      const ephemeralAddress = state.state.evmEphemeralAddress;

      if (outTokenDetails && ephemeralAddress) {
        balanceCheckPromise = checkEvmBalanceForToken({
          amountDesiredRaw: "1", // If we passed expectedAmountRaw, we might timeout if the bridge slipped and delivered slightly less.
          chain: toChain,
          intervalMs: BALANCE_POLLING_TIME_MS,
          ownerAddress: ephemeralAddress,
          signal,
          timeoutMs: pollingTimeoutMs,
          tokenDetails: outTokenDetails
        });
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
    const bridgeCheckPromise = this.checkBridgeStatus(state, swapHash, quote, pollingTimeoutMs, signal).catch(err => {
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
    }
  }

  /**
   * Gets the status of the Axelar bridge
   * @param txHash The swap (bridgeCall) transaction hash
   */
  private async checkBridgeStatus(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    timeoutMs = getSquidRouterPayTimeoutMs(),
    signal?: AbortSignal
  ): Promise<void> {
    let isExecuted = false;
    let payTxHash: string | undefined = state.state.squidRouterPayTxHash;
    const timeoutAt = Date.now() + timeoutMs;

    // The signal-aware sleeps make abandoned executions unwind when the processor
    // times out this phase; without them every timed-out execution left an immortal
    // polling loop behind, and they piled up against the SquidRouter rate limit.
    await sleep(Math.min(this.initialDelayMs ?? SQUIDROUTER_INITIAL_DELAY_MS, timeoutMs), signal);

    while (!isExecuted) {
      if (Date.now() >= timeoutAt) {
        throw this.createRecoverableError(`SquidRouterPayPhaseHandler: Bridge status check timed out after ${timeoutMs}ms`);
      }

      // Set when the initial gas funding ran this iteration: the fetched status
      // predates that payment, so acting on it (e.g. topping up "insufficient" gas)
      // would double-pay. The next iteration sees a fresh status.
      let fundedThisIteration = false;

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
            fundedThisIteration = true;

            const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
            const logIndex = Number(axelarScanStatus.id.split("_")[2]);

            payTxHash = await this.executeFundTransaction(nativeToFundRaw, swapHash as `0x${string}`, logIndex, state, quote);

            let subsidyToken: SubsidyToken;
            let payerAccount: `0x${string}` | undefined;

            if (quote.inputCurrency === FiatToken.BRL) {
              subsidyToken = SubsidyToken.ETH;
              payerAccount = this.baseWalletClient.account?.address as `0x${string}` | undefined;
            } else {
              subsidyToken = SubsidyToken.MATIC;
              payerAccount = this.polygonWalletClient.account?.address as `0x${string}` | undefined;
            }

            const subsidyAmount = nativeToDecimal(nativeToFundRaw, 18).toNumber();

            if (payerAccount) {
              await this.createSubsidy(state, subsidyAmount, subsidyToken, payerAccount, payTxHash);
            }

            await state.update({
              state: { ...state.state, squidRouterPayTxHash: payTxHash }
            });
          } else if (axelarScanStatus.status === "called" && axelarScanStatus.confirm_failed) {
            await this.maybeRecoverStuckConfirm(state, swapHash, axelarScanStatus.call?.chain, signal);
          }

          if (!fundedThisIteration) {
            await this.monitorStuckGmp(state, swapHash, quote, axelarScanStatus ?? undefined, signal);
          }
        } else {
          logger.info("SquidRouterPayPhaseHandler: Same-chain transaction detected. Skipping Axelar check.");
        }
      } catch (error) {
        // Status APIs down is exactly how a stuck transfer looked in production, so
        // the stuck check must also run when no status could be fetched at all.
        await this.monitorStuckGmp(state, swapHash, quote, undefined, signal, error);
        throw this.createRecoverableError(
          `SquidRouterPayPhaseHandler: Failed to check bridge status for ${swapHash}, error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await sleep(this.pollIntervalMs, signal);
    }
  }

  /**
   * Axelar's relayer does not retry a failed validator confirmation poll, so a transfer
   * whose poll failed stays in status "called" forever. Ask Axelar's recovery signing
   * service for a new ConfirmGatewayTx and broadcast it, which restarts the poll.
   * Attempts are rate-limited via a timestamp persisted in the ramp state, and failures
   * are swallowed so the status loop keeps polling and retries after the cooldown.
   */
  private async maybeRecoverStuckConfirm(
    state: RampState,
    swapHash: string,
    sourceChain: string | undefined,
    signal?: AbortSignal
  ): Promise<void> {
    // An unparseable persisted timestamp yields NaN; treat it as "never attempted" so
    // the comparison below stays well-defined (NaN comparisons are always false).
    const parsedLastAttempt = state.state.axelarConfirmRecoveryAt ? new Date(state.state.axelarConfirmRecoveryAt).getTime() : 0;
    const lastAttempt = Number.isFinite(parsedLastAttempt) ? parsedLastAttempt : 0;
    if (Date.now() - lastAttempt < AXELAR_CONFIRM_RECOVERY_COOLDOWN_MS) {
      return;
    }

    if (!sourceChain) {
      logger.warn(
        `SquidRouterPayPhaseHandler: Confirm poll failed for ${swapHash} but Axelar status has no source chain; cannot attempt recovery.`
      );
      return;
    }

    // Persist the attempt timestamp before broadcasting so a failing relayer is not
    // hammered on every 10s poll iteration.
    await state.update({
      state: { ...state.state, axelarConfirmRecoveryAt: new Date().toISOString() }
    });

    try {
      const axelarTxHash = await recoverAxelarStuckConfirm(swapHash, sourceChain, signal);
      logger.info(
        `SquidRouterPayPhaseHandler: Confirm poll failed for ${swapHash}; broadcast recovery ConfirmGatewayTx ${axelarTxHash} on Axelar.`
      );
    } catch (error) {
      logger.warn(
        `SquidRouterPayPhaseHandler: Axelar stuck-confirm recovery attempt failed for ${swapHash}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Time since the ramp entered squidRouterPay, spanning retried executions. */
  private getElapsedInPhaseMs(state: RampState): number {
    const entry = [...(state.phaseHistory ?? [])].reverse().find(e => e.phase === "squidRouterPay");
    const startIso = entry?.timestamp ?? state.createdAt;
    const start = startIso ? new Date(startIso).getTime() : Number.NaN;
    return Number.isFinite(start) ? Date.now() - start : 0;
  }

  /**
   * Active monitoring for a GMP that has been in squidRouterPay past the stuck
   * threshold: classify the Axelar state, take the safe recovery action for that
   * state, and alert ops. Never throws — the surrounding status loop (or its error
   * path) must proceed unchanged. Completion still requires an executed status or
   * arrived destination balance; nothing here marks the phase successful.
   */
  private async monitorStuckGmp(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    axelarScanStatus: AxelarScanStatusResponse | undefined,
    signal?: AbortSignal,
    lastError?: unknown
  ): Promise<void> {
    try {
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
        actionTaken = await this.maybeTopUpGas(state, swapHash, quote, axelarScanStatus);
      } else if (classification === "waiting_source_confirmation" || classification === "source_confirmation_stuck") {
        // A transfer sitting in "called" this long has a stalled validator poll even
        // when axelarscan has not flagged confirm_failed; a fresh ConfirmGatewayTx is
        // safe (public tx hash only) and restarts the poll. Cooldown-gated.
        await this.maybeRecoverStuckConfirm(state, swapHash, axelarScanStatus?.call?.chain, signal);
        actionTaken = "attempted Axelar ConfirmGatewayTx recovery (cooldown-gated)";
      }

      await this.alertStuckGmp(state, swapHash, classification, axelarScanStatus, elapsedMs, actionTaken, lastError);
    } catch (error) {
      logger.warn(
        `SquidRouterPayPhaseHandler: Stuck-GMP monitor failed for ramp ${state.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * One-time supplemental addNativeGas top-up for a transfer whose paid gas Axelar
   * reports as insufficient. Guarded by the persisted squidRouterExtraGasTxHash so
   * it can never be sent twice; overpayment is refunded by the gas service to the
   * funding wallet. Returns a human-readable summary for the ops alert.
   */
  private async maybeTopUpGas(
    state: RampState,
    swapHash: string,
    quote: QuoteTicket,
    axelarScanStatus: AxelarScanStatusResponse | undefined
  ): Promise<string> {
    if (!state.state.squidRouterPayTxHash) {
      return "initial gas payment still pending; regular funding flow will pay";
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

    const nativeToFundRaw = this.calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
    const extraGasTxHash = await this.executeFundTransaction(
      nativeToFundRaw,
      swapHash as `0x${string}`,
      logIndex,
      state,
      quote
    );
    await state.update({
      state: { ...state.state, squidRouterExtraGasTxHash: extraGasTxHash }
    });

    // The Subsidy dedup guard (one row per ramp+phase) already holds the initial gas
    // payment, so this top-up is not recorded there. Keep this line alertable for
    // accounting.
    logger.warn(
      `SQUIDROUTER_EXTRA_GAS_PAID: supplemental Axelar gas top-up sent. ramp=${state.id} amountRaw=${nativeToFundRaw} tx=${extraGasTxHash}`
    );
    return `sent one-time gas top-up ${extraGasTxHash} (${nativeToDecimal(nativeToFundRaw, 18).toNumber()} native units)`;
  }

  private async alertStuckGmp(
    state: RampState,
    swapHash: string,
    classification: GmpClassification,
    axelarScanStatus: AxelarScanStatusResponse | undefined,
    elapsedMs: number,
    actionTaken: string,
    lastError?: unknown
  ): Promise<void> {
    // NaN-safe like axelarConfirmRecoveryAt: an unparseable timestamp means "never".
    const parsedLastAlert = state.state.squidRouterStuckAlertedAt
      ? new Date(state.state.squidRouterStuckAlertedAt).getTime()
      : 0;
    const lastAlert = Number.isFinite(parsedLastAlert) ? parsedLastAlert : 0;
    if (Date.now() - lastAlert < STUCK_ALERT_REPEAT_MS) {
      return;
    }

    // Persist before sending so a failing webhook is not hammered every poll iteration.
    await state.update({
      state: { ...state.state, squidRouterStuckAlertedAt: new Date().toISOString() }
    });

    const guidanceByClassification: Record<GmpClassification, string> = {
      executed: "",
      execution_failed: "destination execution failed — external; retry the execution manually from the Axelarscan page",
      insufficient_gas: "Vortex-actionable: Axelar reports the paid gas as insufficient",
      relayer_pending:
        "gas paid and call approved — likely external Axelar/Squid relayer latency; manual execute possible on Axelarscan",
      source_confirmation_stuck: "validator confirm poll failed — auto-recovery attempted; external if it persists",
      unknown: "status unavailable or not indexed — possible Squid/Axelarscan API outage; check the Axelarscan link manually",
      waiting_source_confirmation: "waiting for Axelar source confirmation — auto-recovery attempted; external if it persists"
    };

    const lastErrorLog = state.errorLogs?.[state.errorLogs.length - 1];
    const lastErrorText =
      lastError instanceof Error ? lastError.message : lastError ? String(lastError) : (lastErrorLog?.error ?? "none");

    const text = [
      `squidRouterPay stuck for ${Math.round(elapsedMs / 60000)} minutes`,
      `- ramp: ${state.id}`,
      `- classification: ${classification} (${guidanceByClassification[classification]})`,
      `- axelar status: ${axelarScanStatus?.status ?? "unavailable"} (confirm_failed=${axelarScanStatus?.confirm_failed ?? "n/a"}, is_insufficient_fee=${axelarScanStatus?.is_insufficient_fee ?? "n/a"}, gas_status=${axelarScanStatus?.gas_status ?? "n/a"})`,
      `- source tx: ${swapHash}`,
      `- squid quote id: ${state.state.squidRouterQuoteId ?? "unknown"}`,
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
          `SquidRouterPayPhaseHandler: Failed to send stuck-GMP Slack alert for ramp ${state.id}: ${error instanceof Error ? error.message : String(error)}`
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
          "SquidRouterPayPhaseHandler: Slack notifier unavailable (SLACK_WEB_HOOK_TOKEN not set); stuck-GMP alerts will only be logged."
        );
        this.slackNotifier = null;
      }
    }
    return this.slackNotifier;
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
      return this.executeFundTransactionOnBase(tokenValueRaw, swapHash, logIndex);
    } else {
      return this.executeFundTransactionOnPolygon(tokenValueRaw, swapHash, logIndex);
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

  /**
   * Execute a call to the Axelar gas service on Base network.
   * @param tokenValueRaw The amount of ETH to fund the transaction with.
   * @param swapHash The swap transaction hash.
   * @param logIndex The log index from Axelar scan.
   * @returns Hash of the transaction that funds the Axelar gas service.
   */
  private async executeFundTransactionOnBase(tokenValueRaw: string, swapHash: `0x${string}`, logIndex: number): Promise<Hash> {
    try {
      const walletClientAccount = this.baseWalletClient.account;

      if (!walletClientAccount) {
        throw new Error("SquidRouterPayPhaseHandler: Base wallet client account not found.");
      }

      // Create addNativeGas transaction data
      const transactionData = encodeFunctionData({
        abi: axelarGasServiceAbi,
        args: [swapHash, logIndex, walletClientAccount.address],
        functionName: "addNativeGas"
      });

      const { maxFeePerGas, maxPriorityFeePerGas } = await this.basePublicClient.estimateFeesPerGas();

      const gasPaymentHash = await this.baseWalletClient.sendTransaction({
        account: walletClientAccount,
        chain: base,
        data: transactionData,
        maxFeePerGas: maxFeePerGas * 2n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 2n,
        to: AXL_GAS_SERVICE_EVM as `0x${string}`,
        value: BigInt(tokenValueRaw)
      });

      logger.info(`SquidRouterPayPhaseHandler: Base fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error("SquidRouterPayPhaseHandler: Error funding gas to Axelar gas service on Base: ", error);
      throw new Error("SquidRouterPayPhaseHandler: Failed to send Base transaction");
    }
  }

  private async getSquidrouterStatus(swapHash: string, state: RampState, quote: QuoteTicket): Promise<SquidRouterPayResponse> {
    try {
      // Always Polygon for Monerium/Alfredpay onramp, Base for BRL
      const fromChain =
        quote.inputCurrency === FiatToken.EURC || isAlfredpayToken(quote.inputCurrency as FiatToken)
          ? Networks.Polygon
          : quote.inputCurrency === FiatToken.BRL
            ? Networks.Base
            : Networks.Moonbeam;
      const fromChainId = getNetworkId(fromChain)?.toString();
      const toChain = quote.to === Networks.AssetHub ? Networks.Moonbeam : quote.to;
      const toChainId = getNetworkId(toChain)?.toString();

      if (!fromChainId || !toChainId) {
        throw new Error("SquidRouterPayPhaseHandler: Invalid from or to network for Squidrouter status check");
      }

      const squidRouterStatus = await getStatus(swapHash, fromChainId, toChainId, state.state.squidRouterQuoteId);
      return squidRouterStatus;
    } catch (squidRouterError) {
      logger.warn(
        `SquidRouterPayPhaseHandler: SquidRouter status check failed for swap hash ${swapHash}, attempting Axelar fallback: ${squidRouterError instanceof Error ? squidRouterError.message : String(squidRouterError)}`
      );

      try {
        const axelarScanStatus = await getStatusAxelarScan(swapHash);

        if (!axelarScanStatus) {
          throw new Error(
            `SquidRouterPayPhaseHandler: Axelar scan status not found for swap hash ${swapHash} during fallback attempt.`
          );
        }

        // Map Axelar status to SquidRouter format, assuming GMP transaction.
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
          `SquidRouterPayPhaseHandler: Both SquidRouter and Axelar fallback failed for swap hash ${swapHash}. Axelar fallback error: ${axelarError instanceof Error ? axelarError.message : String(axelarError)}`
        );
        throw new Error(`SquidRouterPayPhaseHandler: Failed to fetch Squidrouter status for swap hash ${swapHash}`);
      }
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
