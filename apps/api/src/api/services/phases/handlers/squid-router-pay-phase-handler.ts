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
import { QueryTypes } from "sequelize";
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
import { StateMetadata } from "../meta-state-types";
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
// Sentinel persisted to squidRouterExtraGasTxHash before broadcasting the top-up;
// its presence (never cleared on failure) guarantees at most one top-up ever.
const EXTRA_GAS_PENDING_MARKER = "pending";
// Upper bound on a single Squid/axelarscan status request. Without it a hung request
// outlives the phase-processor timeout and the stuck monitor never sees the outage.
const STATUS_REQUEST_TIMEOUT_MS = 30000;
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
      // Kept for the failure path: an error after a successful status fetch (e.g. in
      // gas funding) must not masquerade as an "unknown/API outage" classification.
      let lastAxelarScanStatus: AxelarScanStatusResponse | undefined;
      // Outcome of a confirm recovery already attempted this iteration, so the stuck
      // monitor reports it instead of re-invoking the helper into its own cooldown.
      let recoveryOutcome: string | undefined;

      try {
        const squidRouterStatus = await this.getSquidrouterStatus(swapHash, state, quote, signal);

        if (!squidRouterStatus) {
          logger.warn(`SquidRouterPayPhaseHandler: No squidRouter status found for swap hash ${swapHash}.`);
        } else if (squidRouterStatus.status === "success") {
          logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Squidrouter.`);
          isExecuted = true;
          break;
        }

        const isGmp = squidRouterStatus ? squidRouterStatus.isGMPTransaction : true;

        if (isGmp) {
          const axelarScanStatus = await getStatusAxelarScan(swapHash, this.statusRequestSignal(signal));
          lastAxelarScanStatus = axelarScanStatus ?? undefined;

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

            // Single-key patch: a full-blob write from this execution's snapshot
            // could erase the top-up marker a concurrent execution claimed while
            // the (abort-unaware) funding transaction was in flight.
            await this.patchStateKey(state, "squidRouterPayTxHash", payTxHash);
          } else if (axelarScanStatus.status === "called" && axelarScanStatus.confirm_failed) {
            recoveryOutcome = await this.maybeRecoverStuckConfirm(state, swapHash, axelarScanStatus.call?.chain, signal);
          }

          if (!fundedThisIteration) {
            await this.monitorStuckGmp(state, swapHash, quote, axelarScanStatus ?? undefined, signal, { recoveryOutcome });
          }
        } else {
          logger.info("SquidRouterPayPhaseHandler: Same-chain transaction detected. Skipping Axelar check.");
        }
      } catch (error) {
        // Status APIs down is exactly how a stuck transfer looked in production, so
        // the stuck check must also run when no status could be fetched at all. When
        // the failure happened after a successful fetch (e.g. gas funding), the
        // fetched status is passed along so the alert classifies the real GMP state.
        await this.monitorStuckGmp(state, swapHash, quote, lastAxelarScanStatus, signal, { lastError: error, recoveryOutcome });
        throw this.createRecoverableError(
          `SquidRouterPayPhaseHandler: Failed to check bridge status for ${swapHash}, error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await sleep(this.pollIntervalMs, signal);
    }
  }

  /**
   * Per-request bound for status API calls: a hung request aborts after
   * STATUS_REQUEST_TIMEOUT_MS (or when the phase processor gives up), so an outage
   * surfaces as a classifiable failure instead of stalling the loop indefinitely.
   */
  private statusRequestSignal(signal?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS);
    return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  }

  /**
   * Atomically patch a single key of the JSONB state column via jsonb_set instead
   * of writing the whole blob: a full-blob write from a stale in-memory snapshot
   * could erase keys a concurrent execution persisted in the meantime (e.g. wipe
   * the top-up marker and re-open a payment claim). `guardSql` turns the patch
   * into a conditional claim; the return value is the number of rows updated.
   * Also mirrors a successful patch into the in-memory state. Raw SQL because
   * Model.update() JSON-stringifies fn/where expression objects on JSONB columns
   * instead of rendering them; `key` and `guardSql` are compile-time literals,
   * the value and guard parameters are bound replacements.
   */
  private async patchStateKey(
    state: RampState,
    key: keyof StateMetadata & string,
    value: string,
    guardSql = "TRUE",
    guardReplacements: Record<string, unknown> = {}
  ): Promise<number> {
    const sequelizeInstance = RampState.sequelize;
    if (!sequelizeInstance) {
      throw new Error("SquidRouterPayPhaseHandler: RampState model is not attached to a sequelize instance");
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

  /**
   * Axelar's relayer does not retry a failed validator confirmation poll, so a transfer
   * whose poll failed stays in status "called" forever. Ask Axelar's recovery signing
   * service for a new ConfirmGatewayTx and broadcast it, which restarts the poll.
   * Attempts are rate-limited via a timestamp persisted in the ramp state, and failures
   * are swallowed so the status loop keeps polling and retries after the cooldown.
   * Returns the actual outcome for the ops alert's "action taken" field.
   */
  private async maybeRecoverStuckConfirm(
    state: RampState,
    swapHash: string,
    sourceChain: string | undefined,
    signal?: AbortSignal
  ): Promise<string> {
    // An unparseable persisted timestamp yields NaN; treat it as "never attempted" so
    // the comparison below stays well-defined (NaN comparisons are always false).
    const parsedLastAttempt = state.state.axelarConfirmRecoveryAt ? new Date(state.state.axelarConfirmRecoveryAt).getTime() : 0;
    const lastAttempt = Number.isFinite(parsedLastAttempt) ? parsedLastAttempt : 0;
    if (Date.now() - lastAttempt < AXELAR_CONFIRM_RECOVERY_COOLDOWN_MS) {
      return `confirm recovery on cooldown (last attempt ${new Date(lastAttempt).toISOString()})`;
    }

    if (!sourceChain) {
      logger.warn(
        `SquidRouterPayPhaseHandler: Confirm poll failed for ${swapHash} but Axelar status has no source chain; cannot attempt recovery.`
      );
      return "confirm recovery unavailable: Axelar status has no source chain";
    }

    // Persist the attempt timestamp before broadcasting so a failing relayer is not
    // hammered on every 10s poll iteration. Single-key patch: a full-blob write from
    // this execution's snapshot could erase the top-up marker a concurrent
    // execution just claimed.
    await this.patchStateKey(state, "axelarConfirmRecoveryAt", new Date().toISOString());

    try {
      const axelarTxHash = await recoverAxelarStuckConfirm(swapHash, sourceChain, signal);
      logger.info(
        `SquidRouterPayPhaseHandler: Confirm poll failed for ${swapHash}; broadcast recovery ConfirmGatewayTx ${axelarTxHash} on Axelar.`
      );
      return `broadcast recovery ConfirmGatewayTx ${axelarTxHash} on Axelar`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`SquidRouterPayPhaseHandler: Axelar stuck-confirm recovery attempt failed for ${swapHash}: ${message}`);
      return `confirm recovery attempt failed: ${message}`;
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
    context: { lastError?: unknown; recoveryOutcome?: string } = {}
  ): Promise<void> {
    try {
      // An aborted execution has been abandoned by the processor (a retry may already
      // be running); it must not take recovery actions or send payments.
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
        // A transfer sitting in "called" this long has a stalled validator poll even
        // when axelarscan has not flagged confirm_failed; a fresh ConfirmGatewayTx is
        // safe (public tx hash only) and restarts the poll. Cooldown-gated. When the
        // confirm_failed branch already recovered this iteration, report that real
        // outcome instead of re-invoking the helper into its own fresh cooldown.
        actionTaken =
          context.recoveryOutcome ??
          (await this.maybeRecoverStuckConfirm(state, swapHash, axelarScanStatus?.call?.chain, signal));
      }

      await this.alertStuckGmp(state, swapHash, classification, axelarScanStatus, elapsedMs, actionTaken, context.lastError);
    } catch (error) {
      logger.warn(
        `SquidRouterPayPhaseHandler: Stuck-GMP monitor failed for ramp ${state.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * One-time supplemental addNativeGas top-up for a transfer whose paid gas Axelar
   * reports as insufficient. The "pending" sentinel is claimed via a conditional
   * UPDATE (marker must still be absent in the database) BEFORE broadcasting and is
   * reconciled to the tx hash after, so neither a crash in between nor a concurrent
   * execution can cause a second payment — a top-up with unknown outcome is left
   * for manual handling via the ops alert. Overpayment is refunded by the gas
   * service to the funding wallet. Returns a human-readable summary for the alert.
   */
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
      return "gas top-up previously attempted with unknown outcome; not retrying — check the funding wallet's transactions manually";
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
    // Atomic claim: only the execution that flips the still-absent marker to
    // "pending" may broadcast. A concurrent execution (e.g. a timed-out handler
    // racing its retry) loses the conditional update and takes no action.
    const claimedRows = await this.patchStateKey(
      state,
      "squidRouterExtraGasTxHash",
      EXTRA_GAS_PENDING_MARKER,
      `state->>'squidRouterExtraGasTxHash' IS NULL`
    );
    if (claimedRows === 0) {
      return "gas top-up already claimed by a concurrent execution; not sending";
    }
    const extraGasTxHash = await this.executeFundTransaction(
      nativeToFundRaw,
      swapHash as `0x${string}`,
      logIndex,
      state,
      quote
    );
    await this.patchStateKey(state, "squidRouterExtraGasTxHash", extraGasTxHash);

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
    const previousAlertAt = state.state.squidRouterStuckAlertedAt;
    const parsedLastAlert = previousAlertAt ? new Date(previousAlertAt).getTime() : 0;
    const lastAlert = Number.isFinite(parsedLastAlert) ? parsedLastAlert : 0;
    if (Date.now() - lastAlert < STUCK_ALERT_REPEAT_MS) {
      return;
    }

    // Claim the alert slot with a compare-and-set on the persisted timestamp —
    // before sending, so a failing webhook is not hammered every poll iteration,
    // and conditionally, so concurrent executions cannot double-alert.
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

  // Takes the processor signal (not a pre-bounded request signal): each request gets
  // its own fresh 30s child bound, so a Squid request that hangs into its timeout
  // does not leave an already-aborted signal for the Axelar fallback.
  private async getSquidrouterStatus(
    swapHash: string,
    state: RampState,
    quote: QuoteTicket,
    signal?: AbortSignal
  ): Promise<SquidRouterPayResponse> {
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

      const squidRouterStatus = await getStatus(
        swapHash,
        fromChainId,
        toChainId,
        state.state.squidRouterQuoteId,
        this.statusRequestSignal(signal)
      );
      return squidRouterStatus;
    } catch (squidRouterError) {
      logger.warn(
        `SquidRouterPayPhaseHandler: SquidRouter status check failed for swap hash ${swapHash}, attempting Axelar fallback: ${squidRouterError instanceof Error ? squidRouterError.message : String(squidRouterError)}`
      );

      try {
        const axelarScanStatus = await getStatusAxelarScan(swapHash, this.statusRequestSignal(signal));

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
