import {beforeEach, describe, expect, it, mock} from "bun:test";
import {Op} from "sequelize";
import sequelize from "../../../config/database";
import QuoteTicket from "../../../models/quoteTicket.model";
import {BaseRampService} from "./base.service";

const transaction = { id: "cleanup-test-transaction" };
const expectedDeleteBatchSize = 500;

type QuoteCleanupWhere = {
  expiresAt?: {
    [Op.lt]?: Date;
  };
  id?: {
    [Op.in]?: string[];
  };
  status?: string;
};

type QuoteCleanupOptions = {
  attributes?: string[];
  limit?: number;
  order?: string[][];
  transaction?: unknown;
  where: QuoteCleanupWhere;
};

const transactionMock = mock(async (callback: (tx: unknown) => Promise<number>) => callback(transaction));
const queryMock = mock(async () => [{ acquired: true }]);
const updateMock = mock(async (_values: unknown, _options: QuoteCleanupOptions) => [3]);
const findAllMock = mock(async (_options: QuoteCleanupOptions) => [{ id: "expired-quote-1" }, { id: "expired-quote-2" }]);
const destroyMock = mock(async (_options: QuoteCleanupOptions) => 2);

sequelize.transaction = transactionMock as unknown as typeof sequelize.transaction;
sequelize.query = queryMock as unknown as typeof sequelize.query;
QuoteTicket.update = updateMock as unknown as typeof QuoteTicket.update;
QuoteTicket.findAll = findAllMock as unknown as typeof QuoteTicket.findAll;
QuoteTicket.destroy = destroyMock as unknown as typeof QuoteTicket.destroy;

describe("BaseRampService.cleanupExpiredQuotes", () => {
  let service: BaseRampService;

  beforeEach(() => {
    service = new BaseRampService();
    transactionMock.mockClear();
    queryMock.mockClear();
    updateMock.mockClear();
    findAllMock.mockClear();
    destroyMock.mockClear();
    queryMock.mockImplementation(async () => [{ acquired: true }]);
    updateMock.mockImplementation(async () => [3]);
    findAllMock.mockImplementation(async () => [{ id: "expired-quote-1" }, { id: "expired-quote-2" }]);
    destroyMock.mockImplementation(async () => 2);
  });

  it("does not update or delete quotes when another cleanup worker holds the advisory lock", async () => {
    queryMock.mockImplementation(async () => [{ acquired: false }]);

    const handledCount = await service.cleanupExpiredQuotes();

    expect(handledCount).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
    expect(findAllMock).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("marks expired pending quotes and deletes old expired quotes in a bounded id batch", async () => {
    const handledCount = await service.cleanupExpiredQuotes();

    expect(handledCount).toBe(5);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(findAllMock).toHaveBeenCalledTimes(1);
    expect(destroyMock).toHaveBeenCalledTimes(1);

    const updateOptions = updateMock.mock.calls[0][1];
    expect(updateOptions.transaction).toBe(transaction);
    expect(updateOptions.where.status).toBe("pending");
    expect(updateOptions.where.expiresAt![Op.lt]).toBeInstanceOf(Date);

    const findOptions = findAllMock.mock.calls[0][0];
    expect(findOptions.attributes).toEqual(["id"]);
    expect(findOptions.limit).toBe(expectedDeleteBatchSize);
    expect(findOptions.order).toEqual([["expiresAt", "ASC"]]);
    expect(findOptions.transaction).toBe(transaction);
    expect(findOptions.where.status).toBe("expired");
    expect(findOptions.where.expiresAt![Op.lt]).toBeInstanceOf(Date);

    const destroyOptions = destroyMock.mock.calls[0][0];
    expect(destroyOptions.transaction).toBe(transaction);
    expect(destroyOptions.where.id![Op.in]).toEqual(["expired-quote-1", "expired-quote-2"]);
    expect(destroyOptions.where.status).toBe("expired");
    expect(destroyOptions.where.expiresAt![Op.lt]).toBeInstanceOf(Date);
  });
});
