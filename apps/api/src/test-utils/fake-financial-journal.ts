import { mock } from "bun:test";
import { APIError } from "../api/errors/api-error";
import * as financialOperationNamespace from "../api/services/phases/blocks/core/financial-operation";

const MODULE_PATH = "../api/services/phases/blocks/core/financial-operation";

export interface FakeJournalRow {
  response?: unknown;
  status: "confirmed" | "failed" | "submitted";
}

/**
 * The financial-operation states that matter to a retried side effect, without the table.
 * Install before importing the executor under test, and restore in `afterAll`.
 */
export function installFakeFinancialJournal() {
  const real = { ...financialOperationNamespace };
  const rows = new Map<string, FakeJournalRow>();
  const attempts: string[] = [];

  mock.module(MODULE_PATH, () => ({
    ...real,
    requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
    runFinancialOperation: async ({
      attemptClass,
      beforePerform,
      perform,
      reconcile,
      retryFailed
    }: {
      attemptClass: string;
      beforePerform?: () => Promise<void>;
      perform(key: string): Promise<unknown>;
      reconcile?: (operation: unknown) => Promise<unknown>;
      retryFailed?: boolean;
    }) => {
      attempts.push(attemptClass);
      const row = rows.get(attemptClass);
      if (row?.status === "confirmed") return row.response;
      if (row?.status === "failed" && !retryFailed) {
        throw new APIError({ message: `${attemptClass} definitively failed`, status: 409 });
      }
      if (row?.status === "submitted") {
        let reconciled: unknown;
        try {
          reconciled = await reconcile?.({});
        } catch (error) {
          if (error instanceof real.FinancialOperationRejectedError) rows.set(attemptClass, { status: "failed" });
          throw error;
        }
        if (!reconciled) {
          throw new real.FinancialOperationReconciliationRequiredError({ id: attemptClass } as never, "has unknown outcome");
        }
        rows.set(attemptClass, { response: reconciled, status: "confirmed" });
        return reconciled;
      }
      await beforePerform?.();
      rows.set(attemptClass, { status: "submitted" });
      try {
        const response = await perform(`test-${attemptClass}`);
        rows.set(attemptClass, { response: JSON.parse(JSON.stringify(response)), status: "confirmed" });
        return response;
      } catch (error) {
        if (error instanceof real.FinancialOperationRejectedError) rows.set(attemptClass, { status: "failed" });
        throw error;
      }
    }
  }));

  return {
    attempts,
    reset() {
      rows.clear();
      attempts.length = 0;
    },
    restore() {
      mock.module(MODULE_PATH, () => ({ ...real }));
    },
    rows
  };
}
