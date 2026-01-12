import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api/promise/types";
import { DispatchError, EventRecord } from "@polkadot/types/interfaces";
import { ISubmittableResult } from "@polkadot/types/types";
import {
  ApiManager,
  decodeSubmittableExtrinsic,
  RampDirection,
  RampPhase,
  TransactionTemporarilyBannedError
} from "@vortexfi/shared";
import logger from "../../../../config/logger";
import { SUBSCAN_API_KEY } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Enum for extrinsic status check results
 */
enum ExtrinsicStatus {
  Success = "success",
  Fail = "fail",
  Undefined = "undefined"
}

/**
 * Handler for distributing Network, Vortex, and Partner fees using a stablecoin on Pendulum
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

    // Determine next phase
    const nextPhase = state.type === RampDirection.BUY ? "subsidizePostSwap" : "subsidizePreSwap";

    // Check if we already have a hash stored
    const existingHash = state.state.distributeFeeHash || null;

    if (existingHash) {
      logger.info(`Found existing distribute fee hash for ramp ${state.id}: ${existingHash}`);

      const status = await this.checkExtrinsicStatus(existingHash).catch((_: unknown) => {
        throw this.createRecoverableError(`Failed to check extrinsic status`);
      });

      if (status === ExtrinsicStatus.Success) {
        logger.info(`Existing distribute fee transaction was successful for ramp ${state.id}`);
        return this.transitionToNextPhase(state, nextPhase);
      } else {
        logger.info(`Existing distribute fee transaction was not successful (status: ${status}), will retry`);
      }
    }

    try {
      // Get the pre-signed fee distribution transaction. This can be undefined if no fees are to be distributed.
      const distributeFeeTransaction = this.getPresignedTransaction(state, "distributeFees");
      if (distributeFeeTransaction === undefined) {
        logger.info("No fee distribution transaction data found. Skipping fee distribution.");
        return this.transitionToNextPhase(state, nextPhase);
      }

      const { api } = await this.apiManager.getApi("pendulum");

      const decodedTx = decodeSubmittableExtrinsic(distributeFeeTransaction.txData as string, api);

      logger.info(`Submitting fee distribution transaction for ramp ${state.id}...`);
      const actualTxHash = await this.submitTransaction(decodedTx, api);

      logger.info(`Transaction broadcast with hash ${actualTxHash}. Persisting hash...`);

      // Persist the hash from the submission result
      const updatedState = await state.update({
        state: {
          ...state.state,
          distributeFeeHash: actualTxHash
        }
      });

      // Wait for extrinsic success using Subscan API
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
          //throw this.createUnrecoverableError(`Extrinsic failed for hash ${extrinsicHash}`);
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

          if (status.isBroadcast || status.isInBlock) {
            logger.info(`Transaction broadcasted: ${status.asBroadcast.toString()}`);
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
      const response = await fetch("https://pendulum.api.subscan.io/api/scan/extrinsic", {
        body: JSON.stringify({
          events_limit: 10,
          hash: extrinsicHash,
          hide_events: false
        }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SUBSCAN_API_KEY || ""
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
}

export default new DistributeFeesHandler();
