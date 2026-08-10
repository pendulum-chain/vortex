import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import FinancialOperation from "../../../../../models/financialOperation.model";
import { resetTestDatabase, setupTestDatabase } from "../../../../../test-utils/db";
import type { FlowIdentity } from "./identity";
import { FinancialOperationRejectedError, runFinancialOperation } from "./financial-operation";

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

  it("replays a confirmed target-balance operation when the observed shortfall changes", async () => {
    let observedShortfallRaw = "100";
    const perform = mock(async () => ({ amountRaw: observedShortfallRaw, id: "funding-1" }));
    const operation = {
      ...baseOperation,
      attemptClass: "destination-evm-native-funding-v2",
      request: { destination: "ephemeral-1", network: "base", targetBalanceRaw: "1000" }
    };

    const first = await runFinancialOperation({ ...operation, perform });
    observedShortfallRaw = "20";
    const replayed = await runFinancialOperation({ ...operation, perform });

    expect(perform).toHaveBeenCalledTimes(1);
    expect(replayed).toEqual(first);
    expect(replayed.amountRaw).toBe("100");
  });

  it("replays a confirmed operation before running a new-side-effect preflight", async () => {
    let feesInsideEnvelope = true;
    const beforePerform = mock(async () => {
      if (!feesInsideEnvelope) throw new Error("network fees too high");
    });
    const perform = mock(async () => ({ id: "funding-1" }));

    const first = await runFinancialOperation({ ...baseOperation, beforePerform, perform });
    feesInsideEnvelope = false;
    const replayed = await runFinancialOperation({ ...baseOperation, beforePerform, perform });

    expect(replayed).toEqual(first);
    expect(beforePerform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it("leaves an operation unclaimed when its preflight rejects a new side effect", async () => {
    let feesInsideEnvelope = false;
    const beforePerform = mock(async () => {
      if (!feesInsideEnvelope) throw new Error("network fees too high");
    });
    const perform = mock(async () => ({ id: "funding-1" }));

    await expect(runFinancialOperation({ ...baseOperation, beforePerform, perform })).rejects.toThrow(
      "network fees too high"
    );
    expect(await FinancialOperation.findOne()).toMatchObject({ status: "not_started" });

    feesInsideEnvelope = true;
    await expect(runFinancialOperation({ ...baseOperation, beforePerform, perform })).resolves.toEqual({ id: "funding-1" });
    expect(beforePerform).toHaveBeenCalledTimes(2);
    expect(perform).toHaveBeenCalledTimes(1);
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
    const rejected = new FinancialOperationRejectedError("invalid recipient");
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

  for (const status of [408, 409, 422]) {
    it(`does not infer a definitive rejection from HTTP ${status}`, async () => {
      const rejected = Object.assign(new Error(`provider returned ${status}`), { status });
      const perform = mock(async () => {
        throw rejected;
      });

      await expect(runFinancialOperation({ ...baseOperation, perform, retryFailed: true })).rejects.toThrow(
        `provider returned ${status}`
      );
      await expect(runFinancialOperation({ ...baseOperation, perform, retryFailed: true })).rejects.toThrow(
        "requires reconciliation"
      );

      expect(perform).toHaveBeenCalledTimes(1);
      expect(await FinancialOperation.findOne()).toMatchObject({ status: "unknown" });
    });
  }

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
