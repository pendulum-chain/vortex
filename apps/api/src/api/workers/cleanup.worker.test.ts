import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CleanupPhase } from "@packages/shared";
import RampState, { RampStateAttributes } from "../../models/rampState.model";
import CleanupWorker from "./cleanup.worker";

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

const mockStellarHandler = {
  getCleanupName: () => "stellarCleanup" as CleanupPhase,
  process: mock(async (): Promise<ProcessResult> => [true, null]),
  shouldProcess: mock((_state: RampState) => true)
};

mock.module("../services/phases/post-process", () => ({
  postProcessHandlers: [mockPendulumHandler, mockStellarHandler]
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
    mockStellarHandler.shouldProcess.mockClear();
    mockStellarHandler.process.mockClear();
    updateMock.mockClear();
  });

  it("should process all applicable handlers successfully", async () => {
    mockPendulumHandler.process.mockImplementation(async () => [true, null] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    // Verify both handlers were checked
    expect(mockPendulumHandler.shouldProcess).toHaveBeenCalledTimes(1);
    expect(mockStellarHandler.shouldProcess).toHaveBeenCalledTimes(1);

    // Verify both handlers were processed
    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);
    expect(mockStellarHandler.process).toHaveBeenCalledTimes(1);

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
    mockStellarHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);
    expect(mockStellarHandler.process).toHaveBeenCalledTimes(1);

    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    // Verify the update data
    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(false);
    expect(values.postCompleteState?.cleanup.errors).toEqual([{ error: "Test failure", name: "pendulumCleanup" }]);
  });

  it("should only retry failed handlers on subsequent attempts", async () => {
    testState.postCompleteState.cleanup.errors = [{ error: "Previous failure", name: "pendulumCleanup" }];

    // Setup both handlers to succeed this time
    mockPendulumHandler.process.mockImplementation(async () => [true, null] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    // The pendulum handler should be processed again (because it failed before)
    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);

    // The stellar handler should NOT be processed again (since it didn't fail before)
    expect(mockStellarHandler.process).toHaveBeenCalledTimes(0);

    // Verify errors are cleared when handler succeeds
    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    // Verify the update data. All errors should be cleared.
    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(true);
    expect(values.postCompleteState?.cleanup.errors).toBe(null);
  });

  it("should properly track errors for multiple failed handlers", async () => {
    mockPendulumHandler.process.mockImplementation(async () => [false, new Error("Pendulum failure")] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [false, new Error("Stellar failure")] as ProcessResult);

    await cleanupWorker.testProcessCleanup(testState);

    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    expect(values.postCompleteState?.cleanup.cleanupCompleted).toBe(false);

    const errors = values.postCompleteState?.cleanup.errors;
    expect(errors).toHaveLength(2);
    expect(errors?.some(e => e.name === "pendulumCleanup" && e.error === "Pendulum failure")).toBe(true);
    expect(errors?.some(e => e.name === "stellarCleanup" && e.error === "Stellar failure")).toBe(true);
  });
});
