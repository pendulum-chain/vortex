import { v4 as uuidv4 } from 'uuid';
import { BaseRampService, PresignedTx, RampStateData } from './base.service';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import PhaseMetadata from '../../../models/phaseMetadata.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import httpStatus from 'http-status';
import { Transaction } from 'sequelize';
import phaseProcessor from '../phases/phase-processor';

export interface StartRampRequest {
  quoteId: string;
  presignedTxs: PresignedTx[];
  additionalData?: Record<string, any>;
}

export interface RampResponse {
  id: string;
  type: 'on' | 'off';
  currentPhase: string;
  chainId: number;
  state: any;
  createdAt: Date;
  updatedAt: Date;
}

export class RampService extends BaseRampService {
  /**
   * Start a new ramping process
   */
  public async startRamp(request: StartRampRequest, idempotencyKey?: string): Promise<RampResponse> {
    // Check if we have a cached response for this idempotency key
    if (idempotencyKey) {
      const cachedResponse = await this.getIdempotencyKey(idempotencyKey);
      if (cachedResponse) {
        return cachedResponse.responseBody;
      }
    }

    return this.withTransaction(async (transaction) => {
      // Get and validate the quote
      const quote = await QuoteTicket.findByPk(request.quoteId, { transaction });

      if (!quote) {
        throw new APIError({
          status: httpStatus.NOT_FOUND,
          message: 'Quote not found',
        });
      }

      if (quote.status !== 'pending') {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Quote is ${quote.status}`,
        });
      }

      if (new Date(quote.expiresAt) < new Date()) {
        // Update the quote status to expired
        await quote.update({ status: 'expired' }, { transaction });

        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Quote has expired',
        });
      }

      // Validate presigned transactions
      this.validatePresignedTxs(request.presignedTxs);

      // Mark the quote as consumed
      await this.consumeQuote(quote.id, transaction);

      // Create initial state data
      const stateData: RampStateData = {
        type: quote.rampType,
        currentPhase: 'initial',
        presignedTxs: request.presignedTxs,
        chainId: quote.chainId,
        state: {
          inputAmount: quote.inputAmount,
          inputCurrency: quote.inputCurrency,
          outputAmount: quote.outputAmount,
          outputCurrency: quote.outputCurrency,
          ...request.additionalData,
        },
        quoteId: quote.id,
      };

      // Create the ramp state
      const rampState = await this.createRampState(stateData);

      // Create response
      const response: RampResponse = {
        id: rampState.id,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        chainId: rampState.chainId,
        state: rampState.state,
        createdAt: rampState.createdAt,
        updatedAt: rampState.updatedAt,
      };

      // Store idempotency key if provided
      if (idempotencyKey) {
        await this.storeIdempotencyKey(idempotencyKey, httpStatus.CREATED, response, rampState.id);
      }

      // Start processing the ramp asynchronously
      // We don't await this to avoid blocking the response
      phaseProcessor.processRamp(rampState.id).catch((error) => {
        logger.error(`Error processing ramp ${rampState.id}:`, error);
      });

      return response;
    });
  }

  /**
   * Get the status of a ramping process
   */
  public async getRampStatus(id: string): Promise<RampResponse | null> {
    const rampState = await this.getRampState(id);

    if (!rampState) {
      return null;
    }

    return {
      id: rampState.id,
      type: rampState.type,
      currentPhase: rampState.currentPhase,
      chainId: rampState.chainId,
      state: rampState.state,
      createdAt: rampState.createdAt,
      updatedAt: rampState.updatedAt,
    };
  }

  /**
   * Advance a ramping process to the next phase
   */
  public async advanceRamp(id: string, newPhase: string, metadata?: any): Promise<RampResponse | null> {
    return this.withTransaction(async (transaction) => {
      const rampState = await RampState.findByPk(id, { transaction });

      if (!rampState) {
        return null;
      }

      // Validate phase transition
      await this.validatePhaseTransition(rampState.currentPhase, newPhase);

      // Log the phase transition
      await this.logPhaseTransition(id, newPhase, metadata);

      return {
        id: rampState.id,
        type: rampState.type,
        currentPhase: newPhase,
        chainId: rampState.chainId,
        state: rampState.state,
        createdAt: rampState.createdAt,
        updatedAt: rampState.updatedAt,
      };
    });
  }

  /**
   * Validate a phase transition
   */
  private async validatePhaseTransition(currentPhase: string, newPhase: string): Promise<void> {
    // Get the phase metadata for the current phase
    const phaseMetadata = await PhaseMetadata.findOne({
      where: { phaseName: currentPhase },
    });

    // If no metadata exists, allow the transition (for backward compatibility)
    if (!phaseMetadata) {
      logger.warn(`No phase metadata found for phase ${currentPhase}`);
      return;
    }

    // Check if the transition is valid
    if (!phaseMetadata.validTransitions.includes(newPhase)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Invalid phase transition from ${currentPhase} to ${newPhase}`,
      });
    }
  }

  /**
   * Get the valid transitions for a phase
   */
  public async getValidTransitions(phase: string): Promise<string[]> {
    const phaseMetadata = await PhaseMetadata.findOne({
      where: { phaseName: phase },
    });

    if (!phaseMetadata) {
      return [];
    }

    return phaseMetadata.validTransitions;
  }

  /**
   * Update the state of a ramping process
   */
  public async updateRampStateData(id: string, state: any): Promise<RampResponse | null> {
    return this.withTransaction(async (transaction) => {
      const rampState = await RampState.findByPk(id, { transaction });

      if (!rampState) {
        return null;
      }

      // Update the state
      await rampState.update({ state: { ...rampState.state, ...state } }, { transaction });

      return {
        id: rampState.id,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        chainId: rampState.chainId,
        state: rampState.state,
        createdAt: rampState.createdAt,
        updatedAt: rampState.updatedAt,
      };
    });
  }

  /**
   * Update subsidy details for a ramping process
   */
  public async updateRampSubsidyDetails(
    id: string,
    subsidyDetails: Partial<RampState['subsidyDetails']>,
  ): Promise<RampResponse | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    await this.updateSubsidyDetails(id, subsidyDetails);

    return {
      id: rampState.id,
      type: rampState.type,
      currentPhase: rampState.currentPhase,
      chainId: rampState.chainId,
      state: rampState.state,
      createdAt: rampState.createdAt,
      updatedAt: rampState.updatedAt,
    };
  }

  /**
   * Update nonce sequences for a ramping process
   */
  public async updateRampNonceSequences(
    id: string,
    nonceSequences: Record<string, number>,
  ): Promise<RampResponse | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    await this.updateNonceSequences(id, nonceSequences);

    return {
      id: rampState.id,
      type: rampState.type,
      currentPhase: rampState.currentPhase,
      chainId: rampState.chainId,
      state: rampState.state,
      createdAt: rampState.createdAt,
      updatedAt: rampState.updatedAt,
    };
  }

  /**
   * Log an error for a ramping process
   */
  public async logRampError(id: string, error: string, details?: any): Promise<RampResponse | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    await this.logError(id, rampState.currentPhase, error, details);

    return {
      id: rampState.id,
      type: rampState.type,
      currentPhase: rampState.currentPhase,
      chainId: rampState.chainId,
      state: rampState.state,
      createdAt: rampState.createdAt,
      updatedAt: rampState.updatedAt,
    };
  }

  /**
   * Get the phase history for a ramping process
   */
  public async getPhaseHistory(id: string): Promise<{ phase: string; timestamp: Date; metadata?: any }[] | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    return rampState.phaseHistory;
  }

  /**
   * Get the error logs for a ramping process
   */
  public async getErrorLogs(
    id: string,
  ): Promise<{ phase: string; timestamp: Date; error: string; details?: any }[] | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    return rampState.errorLogs;
  }

  /**
   * Validate presigned transactions
   */
  private validatePresignedTxs(presignedTxs: PresignedTx[]): void {
    if (!Array.isArray(presignedTxs) || presignedTxs.length < 1 || presignedTxs.length > 5) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'presignedTxs must be an array with 1-5 elements',
      });
    }

    for (const tx of presignedTxs) {
      if (!tx.tx_data || !tx.expires_at || !tx.phase) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Each transaction must have tx_data, expires_at, and phase properties',
        });
      }

      // Validate expiration date
      const expiresAt = new Date(tx.expires_at);
      if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Transaction for phase ${tx.phase} has an invalid or expired expires_at date`,
        });
      }
    }
  }
}

export default new RampService();
