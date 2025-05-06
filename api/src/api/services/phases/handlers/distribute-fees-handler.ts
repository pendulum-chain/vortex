import { decodeSubmittableExtrinsic, RampPhase } from 'shared';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { BasePhaseHandler } from '../base-phase-handler';
import { StateMetadata } from '../meta-state-types';
import RampState from '../../../../models/rampState.model';
import QuoteTicket from '../../../../models/quoteTicket.model';
import { ApiManager } from '../../pendulum/apiManager';
import logger from '../../../../config/logger';

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
    return 'distributeFees';
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @param meta The state metadata
   * @returns The next phase and any output
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing distributeFees phase for ramp ${state.id}`);
    const meta = state.state as StateMetadata;

    const quote = await QuoteTicket.findOne({ where: { id: state.quoteId } });
    if (!quote) {
      throw this.createUnrecoverableError(`Quote ticket not found for ID: ${state.quoteId}`);
    }

    const { pendulumEphemeralAddress } = meta;
    if (!pendulumEphemeralAddress) {
      throw this.createUnrecoverableError('Pendulum ephemeral address not found in state metadata');
    }

    try {
      // Get the pre-signed fee distribution transaction
      const { txData } = this.getPresignedTransaction(state, 'distributeFees');
      if (!txData) {
        throw this.createUnrecoverableError('Pre-signed fee distribution transaction not found');
      }

      const { api } = await this.apiManager.getApi('pendulum');

      const decodedTx = decodeSubmittableExtrinsic(txData as string, api);

      await this.submitTransaction(decodedTx, meta.pendulumEphemeralAddress, 'pendulum');
      logger.info(`Successfully submitted fee distribution transaction for ramp ${state.id}`);
    } catch (error: any) {
      logger.error(`Error distributing fees for ramp ${state.id}:`, error);
      throw this.createRecoverableError(`Failed to distribute fees: ${error.message || 'Unknown error'}`);
    }

    // Determine next phase
    let nextPhase: RampPhase | null = null;
    if (state.type === 'on') {
      nextPhase = 'subsidizePostSwap';
    } else {
      nextPhase = 'subsidizePreSwap';
    }

    return this.transitionToNextPhase(state, nextPhase);
  }

  /**
   * Submit a transaction to the blockchain
   * @param tx The transaction to submit
   * @param account The account to use for signing
   * @param network The network to submit to
   * @returns The transaction hash
   */
  private async submitTransaction(
    tx: SubmittableExtrinsic<'promise', any>,
    account: string,
    network: 'pendulum',
  ): Promise<string> {
    try {
      logger.debug(`Submitting transaction to ${network} for ${this.getPhaseName()} phase`);
      const result = await tx.signAndSend(account);
      return result.hash.toString();
    } catch (error) {
      logger.error(`Error submitting transaction to ${network}:`, error);
      throw error;
    }
  }
}

export default new DistributeFeesHandler();
