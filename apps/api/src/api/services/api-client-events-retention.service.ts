import { Op, QueryTypes, Transaction } from "sequelize";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import ApiClientEvent from "../../models/apiClientEvent.model";

export const API_CLIENT_EVENT_RETENTION_DAYS = 7;
const API_CLIENT_EVENT_DELETE_BATCH_SIZE = 10000;
const API_CLIENT_EVENT_CLEANUP_ADVISORY_LOCK_NAMESPACE = 918522;
const API_CLIENT_EVENT_CLEANUP_ADVISORY_LOCK_KEY = 1;

export function getApiClientEventRetentionCutoff(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (API_CLIENT_EVENT_RETENTION_DAYS - 1)));
}

export class ApiClientEventsRetentionService {
  public async cleanupExpiredEvents(now = new Date()): Promise<number> {
    const cutoff = getApiClientEventRetentionCutoff(now);
    let deletedEventsCount = 0;

    while (true) {
      const deletedBatchCount = await this.cleanupExpiredEventsBatch(cutoff);
      deletedEventsCount += deletedBatchCount;

      if (deletedBatchCount < API_CLIENT_EVENT_DELETE_BATCH_SIZE) {
        return deletedEventsCount;
      }
    }
  }

  private async cleanupExpiredEventsBatch(cutoff: Date): Promise<number> {
    return sequelize.transaction(async transaction => {
      const [lock] = await sequelize.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(:namespace, :key) AS acquired",
        {
          replacements: {
            key: API_CLIENT_EVENT_CLEANUP_ADVISORY_LOCK_KEY,
            namespace: API_CLIENT_EVENT_CLEANUP_ADVISORY_LOCK_NAMESPACE
          },
          transaction,
          type: QueryTypes.SELECT
        }
      );

      if (!lock?.acquired) {
        logger.info("Skipping API client events cleanup because another worker holds the cleanup lock");
        return 0;
      }

      return this.cleanupExpiredEventsWithLock(cutoff, transaction);
    });
  }

  private async cleanupExpiredEventsWithLock(cutoff: Date, transaction: Transaction): Promise<number> {
    const expiredEventBatch = await ApiClientEvent.findAll({
      attributes: ["id"],
      limit: API_CLIENT_EVENT_DELETE_BATCH_SIZE,
      order: [["createdAt", "ASC"]],
      transaction,
      where: {
        createdAt: {
          [Op.lt]: cutoff
        }
      }
    });

    const expiredEventIds = expiredEventBatch.map(event => event.id);
    if (expiredEventIds.length === 0) {
      return 0;
    }

    return ApiClientEvent.destroy({
      transaction,
      where: {
        createdAt: {
          [Op.lt]: cutoff
        },
        id: {
          [Op.in]: expiredEventIds
        }
      }
    });
  }
}
