import { v4 as uuidv4 } from 'uuid';
import { BaseRampService, PresignedTx, RampStateData } from './base.service';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import httpStatus from 'http-status';
import { Transaction } from 'sequelize';

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
        await this.storeIdempotencyKey(
          idempotencyKey,
          httpStatus.CREATED,
          response,
          rampState.id
        );
      }

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
  public async advanceRamp(id: string, newPhase: string): Promise<RampResponse | null> {
    return this.withTransaction(async (transaction) => {
      const rampState = await RampState.findByPk(id, { transaction });

      if (!rampState) {
        return null;
      }

      // Update the phase
      await rampState.update({ currentPhase: newPhase }, { transaction });

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
