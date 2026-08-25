import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import FinancialOperation from "../../../../../models/financialOperation.model";
import { resetTestDatabase, setupTestDatabase } from "../../../../../test-utils/db";
import type { FlowIdentity } from "./identity";
import {
  FinancialOperationReconciliationRequiredError,
  FinancialOperationRejectedError,
  runFinancialOperation
} from "./financial-operation";

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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

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

  it("keeps operation inputs immutable while another caller is in preflight", async () => {
    let releasePreflight: () => void = () => undefined;
    let signalPreflightStarted: () => void = () => undefined;
    const preflightStarted = new Promise<void>(resolve => {
      signalPreflightStarted = resolve;
    });
    const preflightReleased = new Promise<void>(resolve => {
      releasePreflight = resolve;
    });
    const firstPerform = mock(async () => ({ id: "external-1" }));
    const competingPerform = mock(async () => ({ id: "external-2" }));

    const first = runFinancialOperation({
      ...baseOperation,
      beforePerform: async () => {
        signalPreflightStarted();
        await preflightReleased;
      },
      perform: firstPerform
    });
    await preflightStarted;

    try {
      await expect(
        runFinancialOperation({
          ...baseOperation,
          perform: competingPerform,
          request: { amount: "11", recipient: "recipient-1" }
        })
      ).rejects.toThrow("different inputs");
    } finally {
      releasePreflight();
    }

    await expect(first).resolves.toEqual({ id: "external-1" });
    expect(firstPerform).toHaveBeenCalledTimes(1);
    expect(competingPerform).not.toHaveBeenCalled();
    await expect(runFinancialOperation({ ...baseOperation, perform: firstPerform })).resolves.toEqual({ id: "external-1" });
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

  it("preserves the default conflict response when an operation identity is reused with different inputs", async () => {
    await runFinancialOperation({
      ...baseOperation,
      perform: async () => ({ id: "external-1" })
    });

    let thrown: unknown;
    try {
      await runFinancialOperation({
        ...baseOperation,
        perform: async () => ({ id: "external-2" }),
        request: { amount: "11", recipient: "recipient-1" }
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).not.toBeInstanceOf(FinancialOperationReconciliationRequiredError);
    expect(thrown).toMatchObject({ status: 409 });
    expect((thrown as Error).message).toContain("different inputs");
  });

  it("opts ramp phases into reconciliation when an operation identity is reused with different inputs", async () => {
    await runFinancialOperation({
      ...baseOperation,
      perform: async () => ({ id: "external-1" })
    });

    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform: async () => ({ id: "external-2" }),
        reconcileRequestMismatch: true,
        request: { amount: "11", recipient: "recipient-1" }
      })
    ).rejects.toMatchObject({ requiresManualReconciliation: true, status: 503 });
  });

  it("adopts a stable request schema only after reconciling a confirmed legacy operation", async () => {
    const first = await runFinancialOperation({
      ...baseOperation,
      perform: async () => ({ id: "external-1" })
    });
    const perform = mock(async () => ({ id: "external-2" }));

    const replayed = await runFinancialOperation({
      ...baseOperation,
      adoptSafeRequestHash: true,
      perform,
      reconcile: async operation => operation.response as { id: string },
      request: { destination: "recipient-1", targetBalanceRaw: "10" }
    });

    expect(replayed).toEqual(first);
    expect(perform).not.toHaveBeenCalled();
  });

  it("adopts a stable request schema for an unclaimed legacy operation", async () => {
    await expect(
      runFinancialOperation({
        ...baseOperation,
        beforePerform: async () => {
          throw new Error("wallet empty");
        },
        perform: async () => ({ id: "external-1" })
      })
    ).rejects.toThrow("wallet empty");

    await expect(
      runFinancialOperation({
        ...baseOperation,
        adoptSafeRequestHash: true,
        perform: async () => ({ id: "external-2" }),
        request: { destination: "recipient-1", targetBalanceRaw: "10" }
      })
    ).resolves.toEqual({ id: "external-2" });
  });

  it("does not overwrite an in-flight legacy request hash during adoption", async () => {
    await expect(
      runFinancialOperation({
        ...baseOperation,
        beforePerform: async () => {
          throw new Error("wallet empty");
        },
        perform: async () => ({ id: "external-1" })
      })
    ).rejects.toThrow("wallet empty");
    const legacyOperation = await FinancialOperation.findOne({ rejectOnEmpty: true });
    const legacyRequestHash = legacyOperation.requestHash;
    const financialOperationModel = FinancialOperation as any;
    const originalUpdate = financialOperationModel.update;
    let interleaved = false;
    financialOperationModel.update = async (values: Record<string, unknown>, options: Record<string, unknown>) => {
      if (!interleaved && "requestHash" in values) {
        interleaved = true;
        await originalUpdate.call(financialOperationModel, { status: "submitted" }, { where: { id: legacyOperation.id } });
        return [0];
      }
      return originalUpdate.call(financialOperationModel, values, options);
    };

    try {
      await expect(
        runFinancialOperation({
          ...baseOperation,
          adoptSafeRequestHash: true,
          perform: async () => ({ id: "external-2" }),
          reconcileRequestMismatch: true,
          request: { destination: "recipient-1", targetBalanceRaw: "10" }
        })
      ).rejects.toMatchObject({ requiresManualReconciliation: true });
    } finally {
      financialOperationModel.update = originalUpdate;
    }

    await expect(FinancialOperation.findByPk(legacyOperation.id)).resolves.toMatchObject({
      requestHash: legacyRequestHash,
      status: "submitted"
    });
  });

  it("does not claim a side effect after another worker adopts a different request hash", async () => {
    await expect(
      runFinancialOperation({
        ...baseOperation,
        beforePerform: async () => {
          throw new Error("wallet empty");
        },
        perform: async () => ({ id: "legacy" })
      })
    ).rejects.toThrow("wallet empty");
    const loserPerform = mock(async () => ({ id: "loser" }));

    await expect(
      runFinancialOperation({
        ...baseOperation,
        adoptSafeRequestHash: true,
        beforePerform: async () => {
          await expect(
            runFinancialOperation({
              ...baseOperation,
              adoptSafeRequestHash: true,
              beforePerform: async () => {
                throw new Error("pause winner before claim");
              },
              perform: async () => ({ id: "winner" }),
              request: { destination: "recipient-1", targetBalanceRaw: "20" }
            })
          ).rejects.toThrow("pause winner before claim");
        },
        perform: loserPerform,
        request: { destination: "recipient-1", targetBalanceRaw: "10" }
      })
    ).rejects.toMatchObject({ status: 409 });

    expect(loserPerform).not.toHaveBeenCalled();
    await expect(FinancialOperation.findOne()).resolves.toMatchObject({ status: "not_started" });
  });

  it("does not adopt a new request schema for an ambiguous legacy operation", async () => {
    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform: async () => {
          throw new Error("connection reset after submission");
        }
      })
    ).rejects.toThrow("connection reset after submission");

    await expect(
      runFinancialOperation({
        ...baseOperation,
        adoptSafeRequestHash: true,
        perform: async () => ({ id: "external-2" }),
        request: { destination: "recipient-1", targetBalanceRaw: "10" }
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

  it("retries typed definitive rejections without requiring reconciliation", async () => {
    const perform = mock(async () => {
      throw new FinancialOperationRejectedError("Amount exceeds global limit.", {
        status: 400,
        type: "provider_limit_exceeded"
      });
    });
    const operation = { ...baseOperation, perform, retryFailed: true };

    await expect(runFinancialOperation(operation)).rejects.toMatchObject({
      status: 400,
      type: "provider_limit_exceeded"
    });
    await expect(runFinancialOperation(operation)).rejects.toMatchObject({
      status: 400,
      type: "provider_limit_exceeded"
    });

    expect(perform).toHaveBeenCalledTimes(2);
    expect(await FinancialOperation.findOne()).toMatchObject({ status: "failed" });
  });

  it("does not let a stale failed-operation reset overwrite another worker's submitted claim", async () => {
    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform: async () => {
          throw new FinancialOperationRejectedError("pre-broadcast rejection");
        }
      })
    ).rejects.toThrow("pre-broadcast rejection");
    const failedOperation = await FinancialOperation.findOne({ rejectOnEmpty: true });
    const financialOperationModel = FinancialOperation as any;
    const originalUpdate = financialOperationModel.update;
    let interleaved = false;
    financialOperationModel.update = async (values: Record<string, unknown>, options: Record<string, unknown>) => {
      if (!interleaved && values.status === "not_started") {
        interleaved = true;
        await originalUpdate.call(financialOperationModel, { status: "submitted" }, { where: { id: failedOperation.id } });
        return [0];
      }
      return originalUpdate.call(financialOperationModel, values, options);
    };
    const retryPerform = mock(async () => ({ id: "external-2" }));

    try {
      await expect(
        runFinancialOperation({ ...baseOperation, perform: retryPerform, retryFailed: true })
      ).rejects.toMatchObject({ requiresManualReconciliation: true });
    } finally {
      financialOperationModel.update = originalUpdate;
    }

    expect(retryPerform).not.toHaveBeenCalled();
    await expect(FinancialOperation.findByPk(failedOperation.id)).resolves.toMatchObject({ status: "submitted" });
  });

  it("does not replay a concurrent retry that confirmed different corrected inputs", async () => {
    await expect(
      runFinancialOperation({
        ...baseOperation,
        perform: async () => {
          throw new FinancialOperationRejectedError("pre-broadcast rejection");
        }
      })
    ).rejects.toThrow("pre-broadcast rejection");
    const financialOperationModel = FinancialOperation as any;
    const originalUpdate = financialOperationModel.update;
    const winnerPerform = mock(async () => ({ id: "winner" }));
    let interleaved = false;
    const interceptUpdate = async (values: Record<string, unknown>, options: Record<string, unknown>) => {
      if (!interleaved && values.status === "not_started") {
        interleaved = true;
        financialOperationModel.update = originalUpdate;
        try {
          await runFinancialOperation({
            ...baseOperation,
            perform: winnerPerform,
            request: { amount: "10", recipient: "winner-recipient" },
            retryFailed: true
          });
        } finally {
          financialOperationModel.update = interceptUpdate;
        }
        return [0];
      }
      return originalUpdate.call(financialOperationModel, values, options);
    };
    financialOperationModel.update = interceptUpdate;
    const loserPerform = mock(async () => ({ id: "loser" }));

    try {
      await expect(
        runFinancialOperation({
          ...baseOperation,
          perform: loserPerform,
          request: { amount: "10", recipient: "loser-recipient" },
          retryFailed: true
        })
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      financialOperationModel.update = originalUpdate;
    }

    expect(winnerPerform).toHaveBeenCalledTimes(1);
    expect(loserPerform).not.toHaveBeenCalled();
    await expect(FinancialOperation.findOne()).resolves.toMatchObject({
      response: { id: "winner" },
      status: "confirmed"
    });
  });

  it("retries a stable authorization with fresh execution inputs after a pre-broadcast rejection", async () => {
    let nonce = 1661;
    const perform = mock(async () => {
      if (nonce === 1661) {
        throw new FinancialOperationRejectedError("transfer amount exceeds balance");
      }
      return { id: "external-2", nonce };
    });
    const operation = {
      ...baseOperation,
      attemptClass: "evm-subsidy-transfer",
      request: {
        destination: "recipient-1",
        network: "base",
        source: "funding-wallet",
        targetBalanceRaw: "132649008405856019523",
        token: "brla"
      },
      retryFailed: true
    };

    await expect(runFinancialOperation({ ...operation, perform })).rejects.toThrow("transfer amount exceeds balance");
    nonce = 1666;
    await expect(runFinancialOperation({ ...operation, perform })).resolves.toEqual({ id: "external-2", nonce: 1666 });

    expect(perform).toHaveBeenCalledTimes(2);
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

  it("records a claimed operation that settles after phase cancellation", async () => {
    const controller = new AbortController();
    const started = deferred();
    const completion = deferred();
    const perform = mock(async () => {
      started.resolve();
      await completion.promise;
      return { id: "external-1" };
    });
    const pending = runFinancialOperation({
      ...baseOperation,
      externalId: result => result.id,
      perform,
      settleAfterAbort: true,
      signal: controller.signal
    });
    await started.promise;

    controller.abort(new Error("phase timed out"));
    completion.resolve();

    await expect(pending).resolves.toEqual({ id: "external-1" });
    expect(await FinancialOperation.findOne()).toMatchObject({
      externalId: "external-1",
      status: "confirmed"
    });
  });
});
