import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import FinancialOperation from "../../../../../models/financialOperation.model";
import { resetTestDatabase, setupTestDatabase } from "../../../../../test-utils/db";
import type { FlowIdentity } from "./identity";
import { runFinancialOperation } from "./financial-operation";

const flow: FlowIdentity = {
  blockSchemaVersions: { payout: 1 },
  catalogVersion: 1,
  id: "test-flow",
  metadataSchemaVersion: 1,
  registrationFactsSchemaVersion: 1,
  stateSchemaVersion: 1,
  topologyHash: "test-topology",
  transactionPlanSchemaVersion: 1,
  version: 2
};

const baseOperation = {
  attemptClass: "provider-ticket",
  flow,
  phase: "payout",
  provider: "test-provider",
  request: { amount: "10", recipient: "recipient-1" },
  scopeId: "ramp-1",
  scopeType: "ramp" as const
};

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

describe("runFinancialOperation", () => {
  it("returns the persisted result without repeating a confirmed side effect", async () => {
    const perform = mock(async (idempotencyKey: string) => ({ id: "external-1", idempotencyKey }));

    const first = await runFinancialOperation({
      ...baseOperation,
      externalId: result => result.id,
      perform
    });
    const second = await runFinancialOperation({
      ...baseOperation,
      externalId: result => result.id,
      perform
    });

    expect(perform).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(await FinancialOperation.findOne()).toMatchObject({
      externalId: "external-1",
      status: "confirmed"
    });
  });

  it("halts retries after an ambiguous provider failure", async () => {
    const perform = mock(async () => {
      throw new Error("connection reset after submission");
    });

    await expect(runFinancialOperation({ ...baseOperation, perform })).rejects.toThrow(
      "connection reset after submission"
    );
    await expect(runFinancialOperation({ ...baseOperation, perform })).rejects.toThrow("requires reconciliation");

    expect(perform).toHaveBeenCalledTimes(1);
    expect(await FinancialOperation.findOne()).toMatchObject({ status: "unknown" });
  });

  it("rejects reuse of an operation identity with different financial inputs", async () => {
    await runFinancialOperation({
      ...baseOperation,
      perform: async () => ({ id: "external-1" })
    });

    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform: async () => ({ id: "external-2" }),
        request: { amount: "11", recipient: "recipient-1" }
      })
    ).rejects.toThrow("different inputs");
  });

  it("allows corrected input after a definitive rejection without a side effect", async () => {
    const rejected = Object.assign(new Error("invalid recipient"), { status: 422 });
    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform: async () => {
          throw rejected;
        }
      })
    ).rejects.toThrow("invalid recipient");

    const result = await runFinancialOperation({
      ...baseOperation,
      perform: async () => ({ id: "external-2" }),
      request: { amount: "10", recipient: "recipient-2" },
      retryFailed: true
    });

    expect(result).toEqual({ id: "external-2" });
    expect(await FinancialOperation.findOne()).toMatchObject({ status: "confirmed" });
  });

  it("does not start an external operation when the phase is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("phase timed out"));
    const perform = mock(async () => ({ id: "external-1" }));

    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform,
        signal: controller.signal
      })
    ).rejects.toThrow("phase timed out");
    expect(perform).not.toHaveBeenCalled();
  });
});
