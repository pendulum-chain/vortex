import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api/promise/types";
import { DispatchError, EventRecord } from "@polkadot/types/interfaces";
import { ISubmittableResult } from "@polkadot/types/types";
import {
  ALFREDPAY_EVM_TOKEN,
  ApiManager,
  checkEvmBalanceForToken,
  decodeSubmittableExtrinsic,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  evmTokenConfig,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  RampDirection,
  RampPhase,
  TransactionTemporarilyBannedError,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { fetchWithTimeout } from "../../../helpers/fetchWithTimeout";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const FEE_BALANCE_POLL_INTERVAL_MS = 5_000;
const FEE_BALANCE_POLL_TIMEOUT_MS = 60_000;

/**
 * Enum for extrinsic status check results
 */
enum ExtrinsicStatus {
  Success = "success",
  Fail = "fail",
  Undefined = "undefined"
}

/**
 * Handler for distributing Network, Vortex, and Partner fees using a stablecoin on Pendulum or EVM chains
 */
export class DistributeFeesHandler extends BasePhaseHandler {
  private apiManager: ApiManager;

  constructor() {
    super();
    this.apiManager = ApiManager.getInstance();
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "distributeFees";
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The next phase and any output
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findOne({ where: { id: state.quoteId } });
    if (!quote) {
      throw this.createUnrecoverableError(`Quote ticket not found for ID: ${state.quoteId}`);
    }

    // Alfredpay corridors distribute on Polygon (USDT) as the LAST phase before complete,
    // after the user-facing legs succeeded — one plain transfer per fee recipient.
    if (quote.metadata.alfredpayMint || quote.metadata.alfredpayOfframp) {
      const usdtDetails = getOnChainTokenDetails(Networks.Polygon, ALFREDPAY_EVM_TOKEN) as EvmTokenDetails | undefined;
      if (!usdtDetails) {
        throw this.createUnrecoverableError("Polygon USDT configuration not found; cannot verify Alfredpay fee balance.");
      }
      return this.executeEvmFeeDistribution(state, quote, Networks.Polygon as EvmNetworks, usdtDetails, "complete");
    }

    // Determine next phase
    const nextPhase = state.type === RampDirection.BUY ? "subsidizePostSwap" : "subsidizePreSwap";

    // EVM-ephemeral flows (BRL, Mykobo EUR, ...) distribute on Base in USDC — also one
    // plain transfer per fee recipient.
    if (quote.metadata.nablaSwapEvm) {
      const baseUsdcConfig = evmTokenConfig[Networks.Base][EvmToken.USDC] as EvmTokenDetails | undefined;
      if (!baseUsdcConfig) {
        throw this.createUnrecoverableError("Base USDC configuration not found; cannot verify fee balance.");
      }
      return this.executeEvmFeeDistribution(state, quote, Networks.Base as EvmNetworks, baseUsdcConfig, nextPhase);
    }

    // --- Substrate (Pendulum) path: a single presigned batch extrinsic ---

    // Check if we already have a hash stored
    const existingHash = state.state.distributeFeeHash || null;
    if (existingHash) {
      logger.info(`Found existing distribute fee hash for ramp ${state.id}: ${existingHash}`);

      const status = await this.checkExtrinsicStatus(existingHash).catch((_: unknown) => {
        throw this.createRecoverableError("Failed to check extrinsic status from existing hash.");
      });

      if (status === ExtrinsicStatus.Success) {
        logger.info(`Existing distribute fee transaction was successful for ramp ${state.id}`);
        return this.transitionToNextPhase(state, nextPhase);
      } else {
        logger.info(`Existing distribute fee transaction was not successful (status: ${status}), will retry`);
      }
    }

    try {
      // Get the pre-signed fee distribution transaction.
      const distributeFeeTransaction = this.getPresignedTransaction(state, "distributeFees");
      if (distributeFeeTransaction === undefined) {
        logger.info("No fee distribution transaction data found. Skipping fee distribution.");
        return this.transitionToNextPhase(state, nextPhase);
      }

      // The fee token may not yet be on the ephemeral when we reach this phase. Poll for
      // it before submitting; if it never arrives within the timeout, throw a recoverable
      // error so we retry the phase.
      await this.ensureSubstrateFeeTokenBalance(state, quote);

      const { api } = await this.apiManager.getApi("pendulum");
      const decodedTx = decodeSubmittableExtrinsic(distributeFeeTransaction.txData as string, api);

      logger.info(`Submitting substrate fee distribution transaction for ramp ${state.id}...`);
      const actualTxHash = await this.submitTransaction(decodedTx, api);

      logger.info(`Transaction broadcast with hash ${actualTxHash}. Persisting hash...`);

      // Persist the hash from the submission result
      const updatedState = await state.update({
        state: {
          ...state.state,
          distributeFeeHash: actualTxHash
        }
      });

      await this.waitForExtrinsicSuccess(actualTxHash);

      logger.info(`Successfully verified fee distribution transaction for ramp ${state.id}: ${actualTxHash}`);
      return this.transitionToNextPhase(updatedState, nextPhase);
    } catch (e: unknown) {
      logger.error(`Error distributing fees for ramp ${state.id}:`, e);

      // If the error is already a PhaseError, propagate it
      if (e instanceof PhaseError) {
        throw e;
      }

      // Wrap as recoverable error
      const error = e instanceof Error ? e : new Error(String(e));
      throw this.createRecoverableError(`Failed to distribute fees: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * EVM corridors (Base USDC, Alfredpay Polygon USDT): broadcast the presigned fee
   * transfers in nonce order, then transition. Each transfer's hash is persisted
   * per-nonce so a retry never re-pays a recipient whose transfer already succeeded.
   */
  private async executeEvmFeeDistribution(
    state: RampState,
    quote: QuoteTicket,
    network: EvmNetworks,
    tokenDetails: EvmTokenDetails,
    nextPhase: RampPhase
  ): Promise<RampState> {
    const feeTxs = (state.presignedTxs ?? []).filter(tx => tx.phase === "distributeFees").sort((a, b) => a.nonce - b.nonce);

    if (feeTxs.length === 0) {
      logger.info(`No fee distribution transactions found for ramp ${state.id}. Skipping fee distribution.`);
      return this.transitionToNextPhase(state, nextPhase);
    }

    try {
      // The fee token may not yet be on the ephemeral when we reach this phase (e.g.
      // squidrouter swap can be slow to credit). Poll for it before submitting; if it
      // never arrives within the timeout, throw a recoverable error so we retry.
      const requiredRaw = this.computeRequiredFeeRaw(quote, tokenDetails.decimals);
      if (requiredRaw) {
        try {
          await checkEvmBalanceForToken({
            amountDesiredRaw: requiredRaw.toFixed(0),
            chain: network,
            intervalMs: FEE_BALANCE_POLL_INTERVAL_MS,
            ownerAddress: feeTxs[0].signer,
            timeoutMs: FEE_BALANCE_POLL_TIMEOUT_MS,
            tokenDetails
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw this.createRecoverableError(
            `Fee distribution precondition failed: ${tokenDetails.assetSymbol} balance not available on ${feeTxs[0].signer} within ${FEE_BALANCE_POLL_TIMEOUT_MS}ms. ${message}`
          );
        }
      }

      const hashes: Record<string, string> = { ...(state.state.distributeFeeHashes ?? {}) };
      // Legacy single-hash idempotency: in-flight ramps registered before the
      // multi-transfer change store one hash for their single fee transaction.
      if (state.state.distributeFeeHash && !hashes[String(feeTxs[0].nonce)]) {
        hashes[String(feeTxs[0].nonce)] = state.state.distributeFeeHash;
      }
      let currentState = state;

      for (const feeTx of feeTxs) {
        const nonceKey = String(feeTx.nonce);
        const existingHash = hashes[nonceKey];
        if (existingHash) {
          const status = await this.checkEvmTransactionStatus(existingHash, network);
          if (status === ExtrinsicStatus.Success) {
            logger.info(`Fee distribution transfer at nonce ${nonceKey} already succeeded for ramp ${state.id}, skipping.`);
            continue;
          }
        }

        logger.info(`Submitting fee distribution transfer (nonce ${nonceKey}) for ramp ${state.id}...`);
        const txHash = await this.submitEvmRawTransaction(feeTx.txData as string, network);
        hashes[nonceKey] = txHash;
        currentState = await currentState.update({
          state: { ...currentState.state, distributeFeeHashes: hashes }
        });
        await this.waitForEvmTransactionSuccess(txHash, network);
        logger.info(`Fee distribution transfer confirmed for ramp ${state.id}: ${txHash}`);
      }

      return this.transitionToNextPhase(currentState, nextPhase);
    } catch (e: unknown) {
      logger.error(`Error distributing fees for ramp ${state.id}:`, e);

      if (e instanceof PhaseError) {
        throw e;
      }

      const error = e instanceof Error ? e : new Error(String(e));
      throw this.createRecoverableError(`Failed to distribute fees: ${error.message || "Unknown error"}`);
    }
  }

  private computeRequiredFeeRaw(quote: QuoteTicket, decimals: number): Big | null {
    const usdFeeStructure = quote.metadata.fees?.usd;
    if (!usdFeeStructure) {
      return null;
    }

    const totalUsd = new Big(usdFeeStructure.network).plus(usdFeeStructure.vortex).plus(usdFeeStructure.partnerMarkup);
    if (totalUsd.lte(0)) {
      return null;
    }

    return multiplyByPowerOfTen(totalUsd, decimals);
  }

  private async ensureSubstrateFeeTokenBalance(state: RampState, quote: QuoteTicket): Promise<void> {
    const { substrateEphemeralAddress } = state.state as StateMetadata;
    if (!substrateEphemeralAddress) {
      throw this.createUnrecoverableError(
        "DistributeFeesHandler: Missing substrateEphemeralAddress in state; cannot verify substrate fee balance."
      );
    }

    // Network reference matches the selection in createSubstrateFeeDistributionTransaction:
    // offramp uses source network, onramp uses destination network. The chosen stablecoin
    // (PENDULUM_USDC_ASSETHUB vs PENDULUM_USDC_AXL) MUST match what the presigned tx transfers.
    const networkReference = state.type === RampDirection.SELL ? quote.from : quote.to;
    const network = getNetworkFromDestination(networkReference);
    if (!network) {
      logger.warn(`DistributeFeesHandler: Invalid network for ${networkReference}; skipping balance precondition check.`);
      return;
    }

    const stablecoinDetails = network === Networks.AssetHub ? PENDULUM_USDC_ASSETHUB : PENDULUM_USDC_AXL;
    const requiredRaw = this.computeRequiredFeeRaw(quote, stablecoinDetails.decimals);
    if (!requiredRaw) {
      logger.info("No positive USD fees configured; skipping fee balance precondition check.");
      return;
    }

    logger.info(
      `Checking substrate fee balance: address=${substrateEphemeralAddress} requires >= ${requiredRaw.toFixed(0)} ${stablecoinDetails.assetSymbol} raw on Pendulum before submitting fee distribution.`
    );

    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");

    const isBalanceSufficient = async (): Promise<boolean> => {
      try {
        const balanceResponse = await pendulumNode.api.query.tokens.accounts(
          substrateEphemeralAddress,
          stablecoinDetails.currencyId
        );
        const free = new Big((balanceResponse as unknown as { free?: { toString(): string } })?.free?.toString() ?? "0");
        return free.gte(requiredRaw);
      } catch (err) {
        logger.debug(`DistributeFeesHandler: error reading substrate balance: ${err instanceof Error ? err.message : err}`);
        return false;
      }
    };

    try {
      await waitUntilTrueWithTimeout(isBalanceSufficient, FEE_BALANCE_POLL_INTERVAL_MS, FEE_BALANCE_POLL_TIMEOUT_MS);
      logger.info(
        `Substrate fee balance precondition met for ${substrateEphemeralAddress} (>= ${requiredRaw.toFixed(0)} ${stablecoinDetails.assetSymbol}).`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw this.createRecoverableError(
        `Fee distribution precondition failed: ${stablecoinDetails.assetSymbol} balance not available on ${substrateEphemeralAddress} within ${FEE_BALANCE_POLL_TIMEOUT_MS}ms. ${message}`
      );
    }
  }

  /**
   * Wait for extrinsic success using Subscan API
   * @param extrinsicHash The extrinsic hash to check
   */
  private async waitForExtrinsicSuccess(extrinsicHash: string): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 180000; // 3 minutes
    const pollIntervalMs = 10000; // 10 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.checkExtrinsicStatus(extrinsicHash);

        if (status === ExtrinsicStatus.Success) {
          return;
        } else if (status === ExtrinsicStatus.Fail) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          continue;
        } else if (status === ExtrinsicStatus.Undefined) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          continue;
        }
      } catch (error: unknown) {
        throw error;
      }
    }

    throw this.createRecoverableError(`Extrinsic status check timed out for hash ${extrinsicHash}`);
  }

  /**
   * Handle dispatch errors from extrinsic submissions
   * @param api The API instance
   * @param dispatchError The dispatch error
   * @param systemExtrinsicFailedEvent The system extrinsic failed event record
   * @param extrinsicCalled The name of the extrinsic that was called
   * @returns An error with details about the failure
   */
  private async handleDispatchError(
    api: ApiPromise,
    dispatchError: DispatchError,
    systemExtrinsicFailedEvent: EventRecord | undefined,
    extrinsicCalled: string
  ): Promise<Error> {
    if (dispatchError?.isModule) {
      const decoded = api.registry.findMetaError(dispatchError.asModule);
      const { name, section, method } = decoded;

      return new Error(`Dispatch error: ${section}.${method}:: ${name}`);
    }

    if (systemExtrinsicFailedEvent) {
      const eventName =
        systemExtrinsicFailedEvent?.event.data && systemExtrinsicFailedEvent?.event.data.length > 0
          ? systemExtrinsicFailedEvent?.event.data[0].toString()
          : "Unknown";

      const {
        phase,
        event: { method, section }
      } = systemExtrinsicFailedEvent;
      logger.error(`Extrinsic failed in phase ${phase.toString()} with ${section}.${method}:: ${eventName}`);

      return new Error(`Failed to dispatch ${extrinsicCalled}`);
    }

    logger.error(`Encountered some other error:  ${dispatchError?.toString()}, ${JSON.stringify(dispatchError)}`);
    return new Error(`Unknown error during ${extrinsicCalled}`);
  }

  /**
   * Submit a transaction to the blockchain
   * @param tx The transaction to submit
   * @param api The API instance
   * @returns The transaction hash when included in block
   */
  private async submitTransaction(tx: SubmittableExtrinsic, api: ApiPromise): Promise<string> {
    logger.debug(`Submitting transaction to Pendulum for ${this.getPhaseName()} phase`);

    return await new Promise((resolve, reject) =>
      tx
        .send((submissionResult: ISubmittableResult) => {
          const { status, events, dispatchError, txHash } = submissionResult;

          // Try to find a 'system.ExtrinsicFailed' event
          const systemExtrinsicFailedEvent = events.find(
            record => record.event.section === "system" && record.event.method === "ExtrinsicFailed"
          );

          if (dispatchError) {
            reject(this.handleDispatchError(api, dispatchError, systemExtrinsicFailedEvent, "distributeFees"));
          }

          if (status.isBroadcast) {
            logger.info(`Transaction broadcasted: ${status.asBroadcast.toString()}`);
            resolve(txHash.toHex());
          }
          if (status.isInBlock) {
            logger.info(`Transaction in block: ${status.asInBlock.toString()}`);
            resolve(txHash.toHex());
          }
        })
        .catch((error: unknown) => {
          logger.error("Error submitting transaction to distribute fees:", error);
          // 1012 means that the extrinsic is temporarily banned and indicates that the extrinsic was already sent
          if (error instanceof Error && error.message.includes("1012:")) {
            return reject(new TransactionTemporarilyBannedError("Transaction for transfer is temporarily banned."));
          }
          reject(new Error(`Failed to do transfer: ${error instanceof Error ? error.message : String(error)}`));
        })
    );
  }

  /**
   * Check extrinsic status using Subscan API
   * @param extrinsicHash The extrinsic hash to check
   * @returns ExtrinsicStatus: Success, Fail, or Undefined
   */
  private async checkExtrinsicStatus(extrinsicHash: string): Promise<ExtrinsicStatus> {
    try {
      const response = await fetchWithTimeout("https://pendulum.api.subscan.io/api/scan/extrinsic", {
        body: JSON.stringify({
          events_limit: 10,
          hash: extrinsicHash,
          hide_events: false
        }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.subscanApiKey || ""
        },
        method: "POST"
      });

      if (!response.ok) {
        logger.error(`Subscan API error: ${response.status} ${response.statusText}`);
        throw new Error(`API response error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info("Subscan response data:", data);

      if (data.code !== 0) {
        logger.error(`Subscan API returned error code: ${data.code}, message: ${data.message}`);
        throw new Error(`Subscan API error code: ${data.code}, message: ${data.message}`);
      }

      if (data.data?.success === true) {
        return ExtrinsicStatus.Success;
      }

      if (data.data?.success === false) {
        return ExtrinsicStatus.Fail;
      }

      return ExtrinsicStatus.Undefined;
    } catch (error: unknown) {
      logger.error(`Error checking extrinsic status with Subscan: ${error}`);
      throw error;
    }
  }

  /**
   * Submit a presigned EVM raw transaction
   * @param serializedTransaction The signed serialized transaction
   * @param network The EVM network
   * @returns The transaction hash
   */
  private async submitEvmRawTransaction(serializedTransaction: string, network: EvmNetworks): Promise<string> {
    logger.debug(`Broadcasting presigned EVM transaction to ${network} for ${this.getPhaseName()} phase`);

    if (typeof serializedTransaction !== "string" || !serializedTransaction.startsWith("0x")) {
      throw new Error(`Invalid presigned EVM transaction data for ${this.getPhaseName()} phase`);
    }

    const evmClientManager = EvmClientManager.getInstance();
    return await evmClientManager.sendRawTransactionWithRetry(network, serializedTransaction as `0x${string}`);
  }

  /**
   * Wait for EVM transaction success
   * @param txHash The transaction hash
   * @param network The EVM network
   */
  private async waitForEvmTransactionSuccess(txHash: string, network: EvmNetworks): Promise<void> {
    const evmClientManager = EvmClientManager.getInstance();
    const publicClient = evmClientManager.getClient(network);

    await waitUntilTrueWithTimeout(
      async () => {
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
          return receipt?.status === "success";
        } catch (error) {
          logger.debug(`Error checking EVM transaction receipt: ${error}`);
          return false;
        }
      },
      2000, // check every 2 seconds
      180000 // timeout after 3 minutes
    );
  }

  /**
   * Check EVM transaction status
   * @param txHash The transaction hash
   * @param network The EVM network where the transaction was submitted
   * @returns ExtrinsicStatus: Success, Fail, or Undefined
   */
  private async checkEvmTransactionStatus(txHash: string, network: EvmNetworks): Promise<ExtrinsicStatus> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const publicClient = evmClientManager.getClient(network);

      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

      if (receipt) {
        if (receipt.status === "success") {
          return ExtrinsicStatus.Success;
        } else {
          return ExtrinsicStatus.Fail;
        }
      }

      return ExtrinsicStatus.Undefined;
    } catch (error: unknown) {
      logger.error(`Error checking EVM transaction status: ${error}`);
      return ExtrinsicStatus.Undefined;
    }
  }
}

export default new DistributeFeesHandler();
