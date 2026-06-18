import { afterEach, describe, expect, it, mock } from "bun:test";
import { Transaction } from "sequelize";
import sequelize from "../../config/database";
import ApiClientEvent from "../../models/apiClientEvent.model";
import {
  API_CLIENT_EVENT_RETENTION_DAYS,
  ApiClientEventsRetentionService,
  getApiClientEventRetentionCutoff
} from "./api-client-events-retention.service";

describe("getApiClientEventRetentionCutoff", () => {
  it("keeps the current UTC calendar day and the previous six days", () => {
    const cutoff = getApiClientEventRetentionCutoff(new Date("2026-06-09T18:30:00.000Z"));

    expect(API_CLIENT_EVENT_RETENTION_DAYS).toBe(7);
    expect(cutoff.toISOString()).toBe("2026-06-03T00:00:00.000Z");
  });

  it("uses the UTC calendar day instead of the local clock time", () => {
    const cutoff = getApiClientEventRetentionCutoff(new Date("2026-01-01T00:30:00.000Z"));

    expect(cutoff.toISOString()).toBe("2025-12-26T00:00:00.000Z");
  });
});

describe("ApiClientEventsRetentionService", () => {
  const originalTransaction = sequelize.transaction;
  const originalQuery = sequelize.query;
  const originalFindAll = ApiClientEvent.findAll;
  const originalDestroy = ApiClientEvent.destroy;

  afterEach(() => {
    sequelize.transaction = originalTransaction;
    sequelize.query = originalQuery;
    ApiClientEvent.findAll = originalFindAll;
    ApiClientEvent.destroy = originalDestroy;
  });

  it("deletes expired events until all batches are drained", async () => {
    const transaction = {} as Transaction;
    const transactionMock = mock(async <T>(callback: (transaction: Transaction) => Promise<T>) => callback(transaction));
    const queryMock = mock(async () => [{ acquired: true }]);
    let findAllCallCount = 0;
    let destroyCallCount = 0;
    const findAllMock = mock(async () => {
      findAllCallCount += 1;
      if (findAllCallCount === 1) {
        return Array.from({ length: 10000 }, (_, index) => ({ id: `first-${index}` }));
      }

      return [{ id: "second-1" }, { id: "second-2" }];
    });
    const destroyMock = mock(async () => {
      destroyCallCount += 1;
      return destroyCallCount === 1 ? 10000 : 2;
    });

    sequelize.transaction = transactionMock as typeof sequelize.transaction;
    sequelize.query = queryMock as unknown as typeof sequelize.query;
    ApiClientEvent.findAll = findAllMock as unknown as typeof ApiClientEvent.findAll;
    ApiClientEvent.destroy = destroyMock as typeof ApiClientEvent.destroy;

    const deletedEventsCount = await new ApiClientEventsRetentionService().cleanupExpiredEvents(
      new Date("2026-06-09T18:30:00.000Z")
    );

    expect(deletedEventsCount).toBe(10002);
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(findAllMock).toHaveBeenCalledTimes(2);
    expect(destroyMock).toHaveBeenCalledTimes(2);
  });

  it("stops without deleting when another worker holds the cleanup lock", async () => {
    const transaction = {} as Transaction;
    const transactionMock = mock(async <T>(callback: (transaction: Transaction) => Promise<T>) => callback(transaction));
    const queryMock = mock(async () => [{ acquired: false }]);
    const findAllMock = mock(async () => [{ id: "expired-event" }]);
    const destroyMock = mock(async () => 1);

    sequelize.transaction = transactionMock as typeof sequelize.transaction;
    sequelize.query = queryMock as unknown as typeof sequelize.query;
    ApiClientEvent.findAll = findAllMock as unknown as typeof ApiClientEvent.findAll;
    ApiClientEvent.destroy = destroyMock as typeof ApiClientEvent.destroy;

    const deletedEventsCount = await new ApiClientEventsRetentionService().cleanupExpiredEvents();

    expect(deletedEventsCount).toBe(0);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(findAllMock).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
  });
});
