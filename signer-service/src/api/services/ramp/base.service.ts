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
}

export class BaseRampService {
  /**
   * Create a new ramp state
   */
  protected async createRampState(data: RampStateData): Promise<RampState> {
    return RampState.create({
      id: uuidv4(),
      ...data,
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
      }
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
    rampId?: string
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
      }
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
