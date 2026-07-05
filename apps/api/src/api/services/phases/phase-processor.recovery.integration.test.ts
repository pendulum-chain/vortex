import {beforeAll, describe, expect, it, mock} from "bun:test";
import fs from "node:fs";
import path from "node:path";

import RampState, {RampStateAttributes, RampStateCreationAttributes} from "../../../models/rampState.model";
import {PhaseProcessor} from "./phase-processor";
import registerPhaseHandlers from "./register-handlers";

const fixturePath = path.join(__dirname, "failedRampStateRecovery.json");

// Copy a failed ramp state into failedRampStateRecovery.json to replay it (see CLAUDE.md).
// Fail fast on a missing/empty fixture: without id/currentPhase/flowVariant the
// PhaseProcessor silently no-ops at its flow-variant guard and the test would "pass"
// without processing anything.
function loadRecoveryFixture(): Partial<RampStateAttributes> {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Recovery fixture not found: ${fixturePath}. Copy a failed ramp state there first (see CLAUDE.md).`);
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Partial<RampStateAttributes>;
  if (!fixture.id || !fixture.currentPhase || !fixture.flowVariant) {
    throw new Error(`Recovery fixture ${fixturePath} must contain at least id, currentPhase and flowVariant.`);
  }
  return fixture;
}

const RAMP_STATE_RECOVERY = process.env.RUN_LIVE_TESTS ? loadRecoveryFixture() : {};

// Module-level patching only when the live suite is enabled — bun runs all
// test files in one process, so unconditional patches leak into other files.
// Mock the RampRecoveryWorker
if (process.env.RUN_LIVE_TESTS)
mock.module("../../workers/ramp-recovery.worker", () => ({
  default: class MockRampRecoveryWorker {
    start = mock(() => {
      // Mock implementation
    });
    stop = mock(() => {
      // Mock implementation
    });
  }
}));

let rampState: RampState;

// Proper Sequelize types
type RampStateUpdateData = Partial<RampStateAttributes>;

const filePath = fixturePath;

beforeAll(() => {
  rampState = {
    ...RAMP_STATE_RECOVERY,
    reload: async function () {
      return rampState;
    },
    update: async function (updateData: RampStateUpdateData, _options?: unknown) {
      rampState = { ...rampState, ...updateData } as unknown as RampState;
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    }
  } as unknown as RampState;
});

// Guarded for the same leak reason as the mock.module call above.
if (process.env.RUN_LIVE_TESTS) {
// Mock RampState.update - static method returns [affectedCount, affectedRows]
RampState.update = mock(async function (updateData: RampStateUpdateData, _options?: unknown) {
  rampState = { ...rampState, ...updateData } as unknown as RampState;
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return [1, [rampState]]; // Return tuple as expected by Sequelize
}) as unknown as typeof RampState.update;

RampState.findByPk = mock(async (_id: string) => {
  return {
    ...rampState,
    reload: async function (_options?: unknown) {
      return rampState;
    },
    update: async function (updateData: RampStateUpdateData, _options?: unknown) {
      rampState = { ...rampState, ...updateData } as unknown as RampState;
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    }
  };
}) as typeof RampState.findByPk;

RampState.create = mock(async (data: RampStateCreationAttributes) => {
  rampState = {
    ...data,
    createdAt: new Date(),
    id: data.id || "test-recovery-id",
    reload: async function (_options?: unknown) {
      return rampState;
    },
    update: async function (updateData: RampStateUpdateData, _options?: unknown) {
      rampState = { ...rampState, ...updateData } as unknown as RampState;
      return rampState;
    },
    updatedAt: new Date()
  } as unknown as RampState;
  return rampState;
}) as typeof RampState.create;
}

// Live test: replays a persisted failed ramp state against real services.
// Opt-in via RUN_LIVE_TESTS=1 (see docs/testing-strategy.md).
describe.skipIf(!process.env.RUN_LIVE_TESTS)("Restart PhaseProcessor Integration Test", () => {
  it("should re-start an offramp (evm -> sepa) through multiple phases until completion", async () => {
    try {
      const processor = new PhaseProcessor();

      // wait for handlers to be registered
      registerPhaseHandlers();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await processor.processRamp(rampState.id);

      // processRamp swallows phase failures internally (it only logs them), so the
      // outcome must be observed on the ramp state itself rather than via exceptions.
      const finalState = await waitForCompleteRamp();
      expect(finalState.currentPhase).toBe("complete");
    } catch (error) {
      fs.writeFileSync(fixturePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});

async function waitForCompleteRamp(): Promise<RampState> {
  const pollInterval = 10 * 1000; // 10 seconds
  const globalTimeout = 15 * 60 * 1000; // 15 minutes
  const stalePhaseTimeout = 5 * 60 * 1000; // 5 minutes

  const startTime = Date.now();
  let lastUpdated = Date.now();
  let lastPhase = rampState.currentPhase;

  while (true) {
    if (rampState.currentPhase === "complete") {
      return rampState;
    }
    if (rampState.currentPhase === "failed") {
      throw new Error("Ramp entered the failed phase during recovery.");
    }
    if (rampState.currentPhase !== lastPhase) {
      lastPhase = rampState.currentPhase;
      lastUpdated = Date.now();
    }

    if (Date.now() - lastUpdated > stalePhaseTimeout) {
      throw new Error(`Ramp has been stuck in phase '${rampState.currentPhase}' for more than 5 minutes.`);
    }
    if (Date.now() - startTime > globalTimeout) {
      throw new Error("Global timeout of 15 minutes reached without completing the ramp process.");
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}
