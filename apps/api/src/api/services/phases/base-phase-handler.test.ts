import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { RampPhase } from "@vortexfi/shared";
import FinancialOperation from "../../../models/financialOperation.model";
import RampState from "../../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { ReconciliationRequiredPhaseError } from "../../errors/phase-error";
import type { FlowIdentity } from "./blocks/core/identity";
import { BasePhaseHandler } from "./base-phase-handler";

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

const state = {
  id: "ramp-1",
  state: { flow }
} as RampState;

class TestFinancialPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "finalSettlementSubsidy";
  }

  public run<Result>(perform: (idempotencyKey: string) => Promise<Result>): Promise<Result> {
    return this.runFinancialOperation(state, {
      attemptClass: "test-operation",
      perform,
      provider: "test-provider",
      request: { amount: "10" }
    });
  }

  protected async executePhase(rampState: RampState): Promise<RampState> {
    return rampState;
  }
}

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

describe("BasePhaseHandler financial operations", () => {
  it("derives the ramp and phase identity", async () => {
    await new TestFinancialPhaseHandler().run(async () => ({ id: "external-1" }));

    expect(await FinancialOperation.findOne()).toMatchObject({
      flowId: flow.id,
      flowVersion: flow.version,
      phase: "finalSettlementSubsidy",
      scopeId: state.id,
      scopeType: "ramp",
      status: "confirmed"
    });
  });

  it("translates an ambiguous retry into a reconciliation phase error", async () => {
    const perform = mock(async () => {
      throw new Error("connection reset after submission");
    });
    const handler = new TestFinancialPhaseHandler();

    await expect(handler.run(perform)).rejects.toThrow("connection reset after submission");
    await expect(handler.run(perform)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(perform).toHaveBeenCalledTimes(1);
  });
});
