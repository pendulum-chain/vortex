import {afterAll, beforeEach, describe, expect, it, mock} from "bun:test";
import {CleanupPhase} from "@vortexfi/shared";
import * as loggerNamespace from "../../config/logger";
import * as postProcessNamespace from "../services/phases/post-process";
import RampState, {RampStateAttributes} from "../../models/rampState.model";
import CleanupWorker from "./cleanup.worker";

// Value copies taken before the mock.module calls below; restored in afterAll
// because bun module mocks are process-wide and would poison later test files.
const loggerReal = { ...loggerNamespace };
const postProcessReal = { ...postProcessNamespace };
const realRampStateUpdate = RampState.update;

// CleanupWorker's CronJob is created with runOnInit=true, so merely
// constructing the worker fires a real cleanup cycle (live DB queries) in the
// background. Neutralize the tick target for the duration of this file.
const workerPrototype = CleanupWorker.prototype as unknown as { cleanup: () => Promise<void> };
const realCleanupCycle = workerPrototype.cleanup;
workerPrototype.cleanup = async () => {};

afterAll(() => {
  mock.module("../../config/logger", () => ({ ...loggerReal }));
  mock.module("../services/phases/post-process", () => ({ ...postProcessReal }));
  RampState.update = realRampStateUpdate;
  workerPrototype.cleanup = realCleanupCycle;
});

class TestCleanupWorker extends CleanupWorker {
  public async testProcessCleanup(state: RampState): Promise<void> {
    return this.processCleanup(state);
  }
}

mock.module("../../config/logger", () => ({
  default: {
    error: mock(() => {
      console.log("error");
    }),
    info: mock(() => {
      console.log("info");
    }),
    warn: mock(() => {
      console.log("warn");
    })
  }
}));

type ProcessResult = readonly [boolean, Error | null];

const mockPendulumHandler = {
  getCleanupName: () => "pendulumCleanup" as CleanupPhase,
  process: mock(async (): Promise<ProcessResult> => [true, null]),
  shouldProcess: mock((_state: RampState) => true)
};

mock.module("../services/phases/post-process", () => ({
  postProcessHandlers: [mockPendulumHandler]
}));

const updateMock = mock((_values: Partial<RampStateAttributes>, _options: { where: { id: string } }) => {
  return Promise.resolve([1, []]);
});
RampState.update = updateMock as unknown as typeof RampState.update;

/**
 * Unit tests for processCleanup method in CleanupWorker.
 */
describe("CleanupWorker - processCleanup", () => {
  let cleanupWorker: TestCleanupWorker;
  let testState: RampState;

  beforeEach(() => {
    cleanupWorker = new TestCleanupWorker();

    testState = {
      currentPhase: "complete",
      id: "test-state-id",
      postCompleteState: {
        cleanup: {
          cleanupCompleted: false,
          errors: null
        }
      }
    } as RampState;

    mockPendulumHandler.shouldProcess.mockClear();
    mockPendulumHandler.process.mockClear();
    updateMock.mockClear();
  });

  it("should process all applicable handlers successfully", async () => {
    mockPendulumHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    // Verify handler was checked
    expect(mockPendulumHandler.shouldProcess).toHaveBeenCalledTimes(1);

    // Verify handler was processed
    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);

    // Verify state was updated correctly
    expect(updateMock).toHaveBeenCalledTimes(1);

    // Verify update data
    const [values, options] = updateMock.mock.calls[0];

    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(true);
    expect(values.postCompleteState?.cleanup.errors).toBe(null);

    expect(options.where.id).toBe(testState.id);
  });

  it("should handle one handler failing and track the error", async () => {
    // Setup one handler to fail
    const testError = new Error("Test failure");
    mockPendulumHandler.process.mockImplementation(async () => [false, testError] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);

    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    // Verify the update data
    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(false);
    expect(values.postCompleteState?.cleanup.errors).toEqual([{ error: "Test failure", name: "pendulumCleanup" }]);
  });

  it("should only retry failed handlers on subsequent attempts", async () => {
    testState.postCompleteState.cleanup.errors = [{ error: "Previous failure", name: "pendulumCleanup" }];

    // Setup handler to succeed this time
    mockPendulumHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    // The pendulum handler should be processed again (because it failed before)
    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);

    // Verify errors are cleared when handler succeeds
    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    // Verify the update data. All errors should be cleared.
    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(true);
    expect(values.postCompleteState?.cleanup.errors).toBe(null);
  });

  it("should properly track errors for failed handler", async () => {
    mockPendulumHandler.process.mockImplementation(async () => [false, new Error("Pendulum failure")] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(false);

    const errors = values.postCompleteState?.cleanup.errors;
    expect(errors).toHaveLength(1);
    expect(errors?.some(e => e.name === "pendulumCleanup" && e.error === "Pendulum failure")).toBe(true);
  });
});
