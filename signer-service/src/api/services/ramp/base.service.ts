import { v4 as uuidv4 } from 'uuid';
import { Transaction, Op } from 'sequelize';
import logger from '../../../config/logger';
import RampState, { RampStateAttributes } from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import sequelize from '../../../config/database';
import { RampPhase } from 'shared';

export class BaseRampService {
  /**
   * Create a new ramp state
   */
  protected async createRampState(
    data: Omit<RampStateAttributes, 'id' | 'createdAt' | 'updatedAt' | 'errorLogs' | 'phaseHistory'>,
  ): Promise<RampState> {
    return RampState.create({
      id: uuidv4(),
      ...data,
      phaseHistory: [
        {
          phase: data.currentPhase,
          timestamp: new Date(),
        },
      ],
      errorLogs: [],
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
  protected async updateRampState(id: string, data: Partial<RampStateAttributes>): Promise<[number, RampState[]]> {
    return RampState.update(data, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Log a phase transition
   */
  protected async logPhaseTransition(id: string, newPhase: RampPhase, metadata?: any): Promise<void> {
    const rampStateModel = await RampState.findByPk(id);
    if (!rampStateModel) {
      throw new Error(`RampState with id ${id} not found`);
    }

    const phaseHistory = [
      ...rampStateModel.dataValues.phaseHistory,
      {
        phase: newPhase,
        timestamp: new Date(),
        metadata,
      },
    ];

    await rampStateModel.update({
      currentPhase: newPhase,
      phaseHistory,
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
      },
    );
  }

  /**
   * Check if a quote is valid (pending and not expired)
   */
  protected async isQuoteValid(id: string): Promise<boolean> {
    const quoteModel = await QuoteTicket.findOne({
      where: { id },
    });

    if (!quoteModel) {
      return false;
    }

    const quote = quoteModel.dataValues;

    return quote.status === 'pending' && new Date(quote.expiresAt) > new Date();
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
}
