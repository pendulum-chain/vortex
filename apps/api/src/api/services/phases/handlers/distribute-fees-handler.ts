import {
  ApiManager,
  decodeSubmittableExtrinsic,
  RampDirection,
  RampPhase,
  TransactionTemporarilyBannedError
} from "@packages/shared";
import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { DispatchError, EventRecord } from "@polkadot/types/interfaces";
import { ISubmittableResult } from "@polkadot/types/types";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

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

    try {
      // Get the pre-signed fee distribution transaction. This can be undefined if no fees are to be distributed.
      const distributeFeeTransaction = this.getPresignedTransaction(state, "distributeFees");
      if (distributeFeeTransaction === undefined) {
        logger.info("No fee distribution transaction data found. Skipping fee distribution.");
        return this.transitionToNextPhase(state, nextPhase);
      }

      const { api } = await this.apiManager.getApi("pendulum");

      const decodedTx = decodeSubmittableExtrinsic(distributeFeeTransaction.txData as string, api);
      await this.submitTransaction(decodedTx, api);
      logger.info(`Successfully submitted fee distribution transaction for ramp ${state.id}`);
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error(`Error distributing fees for ramp ${state.id}:`, error);
      throw this.createRecoverableError(`Failed to distribute fees: ${error.message || "Unknown error"}`);
    }

    return this.transitionToNextPhase(state, nextPhase);
  }

  /**
   * Submit a transaction to the blockchain
   * @param tx The transaction to submit
   * @param api The API instance
   * @returns The transaction hash
   */
  private async submitTransaction(tx: SubmittableExtrinsic<"promise">, api: ApiPromise): Promise<void> {
    logger.debug(`Submitting transaction to Pendulum for ${this.getPhaseName()} phase`);
    return await new Promise((resolve, reject) =>
      tx
        .send((submissionResult: ISubmittableResult) => {
          const { status, events, dispatchError } = submissionResult;

          // Try to find a 'system.ExtrinsicFailed' event
          const systemExtrinsicFailedEvent = events.find(
            record => record.event.section === "system" && record.event.method === "ExtrinsicFailed"
          );

          if (dispatchError) {
            reject(this.handleDispatchError(api, dispatchError, systemExtrinsicFailedEvent, "distributeFees"));
          }

          if (status.isFinalized) {
            logger.info(`Transaction to distribute fees finalized: ${status.asFinalized.toString()}`);
            resolve();
          }
        })
        .catch(error => {
          // 1012 means that the extrinsic is temporarily banned and indicates that the extrinsic was already sent
          if (error?.message.includes("1012:")) {
            reject(new TransactionTemporarilyBannedError("Transaction for transfer is temporarily banned."));
          }
          reject(new Error(`Failed to do transfer: ${error}`));
        })
    );
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
}

export default new DistributeFeesHandler();
