import { v4 as uuidv4 } from 'uuid';
import logger from '../../../config/logger';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import IdempotencyKey from '../../../models/idempotencyKey.model';
import { Transaction, Op } from 'sequelize';
import sequelize from '../../../config/database';

export interface PresignedTx {
  tx_data: string;
  expires_at: string;
  phase: string;
}

export interface RampStateData {
  type: 'on' | 'off';
  currentPhase: string;
  presignedTxs: PresignedTx[];
  chainId: number;
  state: any;
  quoteId: string;
  phaseHistory?: { phase: string; timestamp: Date; metadata?: any }[];
  errorLogs?: { phase: string; timestamp: Date; error: string; details?: any }[];
  subsidyDetails?: {
    hardLimit?: string;
    softLimit?: string;
    consumed?: string;
    remaining?: string;
  };
  nonceSequences?: Record<string, number>;
}

export class BaseRampService {
  /**
   * Create a new ramp state
   */
  protected async createRampState(data: RampStateData): Promise<RampState> {
    return RampState.create({
      id: uuidv4(),
      ...data,
      phaseHistory: data.phaseHistory || [
        {
          phase: data.currentPhase,
          timestamp: new Date(),
        },
      ],
      errorLogs: data.errorLogs || [],
      subsidyDetails: data.subsidyDetails || {},
      nonceSequences: data.nonceSequences || {},
    });
  }

  /**
   * Get a ramp state by ID
   */
  protected async getRampState(id: string): Promise<RampState | null> {
    return RampState.findByPk(id, {
      include: [{ model: QuoteTicket, as: 'quote' }],
    });
  }

  /**
   * Update a ramp state
   */
  protected async updateRampState(id: string, data: Partial<RampStateData>): Promise<[number, RampState[]]> {
    return RampState.update(data, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Log a phase transition
   */
  protected async logPhaseTransition(id: string, newPhase: string, metadata?: any): Promise<void> {
    const rampState = await RampState.findByPk(id);
    if (!rampState) {
      throw new Error(`RampState with id ${id} not found`);
    }

    const phaseHistory = [
      ...rampState.phaseHistory,
      {
        phase: newPhase,
        timestamp: new Date(),
        metadata,
      },
    ];

    await rampState.update({
      currentPhase: newPhase,
      phaseHistory,
    });
  }

  /**
   * Log an error
   */
  protected async logError(id: string, phase: string, error: string, details?: any): Promise<void> {
    const rampState = await RampState.findByPk(id);
    if (!rampState) {
      throw new Error(`RampState with id ${id} not found`);
    }

    const errorLogs = [
      ...rampState.errorLogs,
      {
        phase,
        timestamp: new Date(),
        error,
        details,
      },
    ];

    await rampState.update({ errorLogs });
  }

  /**
   * Update subsidy details
   */
  protected async updateSubsidyDetails(
    id: string,
    subsidyDetails: Partial<RampState['subsidyDetails']>,
  ): Promise<void> {
    const rampState = await RampState.findByPk(id);
    if (!rampState) {
      throw new Error(`RampState with id ${id} not found`);
    }

    await rampState.update({
      subsidyDetails: {
        ...rampState.subsidyDetails,
        ...subsidyDetails,
      },
    });
  }

  /**
   * Update nonce sequences
   */
  protected async updateNonceSequences(id: string, newSequences: Record<string, number>): Promise<void> {
    const rampState = await RampState.findByPk(id);
    if (!rampState) {
      throw new Error(`RampState with id ${id} not found`);
    }

    const updatedSequences = { ...rampState.nonceSequences };

    // Merge the new sequences
    Object.keys(newSequences).forEach((key) => {
      updatedSequences[key] = newSequences[key];
    });

    await rampState.update({ nonceSequences: updatedSequences });
  }

  /**
   * Get a quote ticket by ID
   */
  protected async getQuoteTicket(id: string): Promise<QuoteTicket | null> {
    return QuoteTicket.findByPk(id);
  }

  /**
   * Mark a quote as consumed
   */
  protected async consumeQuote(id: string, transaction?: Transaction): Promise<[number, QuoteTicket[]]> {
    return QuoteTicket.update(
      { status: 'consumed' },
      {
        where: { id, status: 'pending' },
        returning: true,
        transaction,
      },
    );
  }

  /**
   * Check if a quote is valid (pending and not expired)
   */
  protected async isQuoteValid(id: string): Promise<boolean> {
    const quote = await QuoteTicket.findOne({
      where: { id },
    });

    if (!quote) {
      return false;
    }

    return quote.status === 'pending' && new Date(quote.expiresAt) > new Date();
  }

  /**
   * Store an idempotency key with a response
   */
  protected async storeIdempotencyKey(
    key: string,
    responseStatus: number,
    responseBody: any,
    rampId?: string,
  ): Promise<IdempotencyKey> {
    return IdempotencyKey.create({
      key,
      rampId,
      responseStatus,
      responseBody,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    });
  }

  /**
   * Get an idempotency key
   */
  protected async getIdempotencyKey(key: string): Promise<IdempotencyKey | null> {
    return IdempotencyKey.findByPk(key);
  }

  /**
   * Execute a function within a transaction
   */
  protected async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transaction = await sequelize.transaction();
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      logger.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Clean up expired quotes
   */
  public async cleanupExpiredQuotes(): Promise<number> {
    const [count] = await QuoteTicket.update(
      { status: 'expired' },
      {
        where: {
          status: 'pending',
          expiresAt: {
            [Op.lt]: new Date(),
          },
        },
      },
    );
    return count;
  }

  /**
   * Clean up expired idempotency keys
   */
  public async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const count = await IdempotencyKey.destroy({
      where: {
        expiredAt: {
          [Op.lt]: new Date(),
        },
      },
    });
    return count;
  }
}
