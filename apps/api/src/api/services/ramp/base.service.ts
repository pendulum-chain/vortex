import { RampPhase } from "@packages/shared";
import { Op, Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState, { RampStateAttributes } from "../../../models/rampState.model";
import { StateMetadata } from "../phases/meta-state-types";

export class BaseRampService {
  /**
   * Create a new ramp state
   */
  protected async createRampState(
    data: Omit<RampStateAttributes, "id" | "createdAt" | "updatedAt" | "errorLogs" | "phaseHistory">
  ): Promise<RampState> {
    return RampState.create({
      id: uuidv4(),
      ...data,
      errorLogs: [],
      phaseHistory: [
        {
          phase: data.currentPhase,
          timestamp: new Date()
        }
      ]
    });
  }

  /**
   * Get a ramp state by ID
   */
  protected async getRampState(id: string): Promise<RampState | null> {
    return RampState.findByPk(id, {
      include: [{ as: "quote", model: QuoteTicket }]
    });
  }

  /**
   * Update a ramp state
   */
  protected async updateRampState(id: string, data: Partial<RampStateAttributes>): Promise<[number, RampState[]]> {
    return RampState.update(data, {
      returning: true,
      where: { id }
    });
  }

  /**
   * Log a phase transition
   */
  protected async logPhaseTransition(id: string, newPhase: RampPhase, metadata?: StateMetadata): Promise<void> {
    const rampState = await RampState.findByPk(id);
    if (!rampState) {
      throw new Error(`RampState with id ${id} not found`);
    }

    const phaseHistory = [
      ...rampState.phaseHistory,
      {
        metadata,
        phase: newPhase,
        timestamp: new Date()
      }
    ];

    await rampState.update({
      currentPhase: newPhase,
      phaseHistory
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
      { status: "consumed" },
      {
        returning: true,
        transaction,
        where: { id, status: "pending" }
      }
    );
  }

  /**
   * Check if a quote is valid (pending and not expired)
   */
  protected async isQuoteValid(id: string): Promise<boolean> {
    const quote = await QuoteTicket.findOne({
      where: { id }
    });

    if (!quote) {
      return false;
    }

    return quote.status === "pending" && new Date(quote.expiresAt) > new Date();
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
      logger.error("Transaction failed:", error);
      throw error;
    }
  }

  /**
   * Clean up expired quotes by deleting them from the database
   */
  public async cleanupExpiredQuotes(): Promise<number> {
    const count = await QuoteTicket.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        },
        status: "pending"
      }
    });
    return count;
  }
}
