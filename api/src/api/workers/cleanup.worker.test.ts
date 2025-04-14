// eslint-disable-next-line import/no-unresolved
import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { CleanupWorker } from './cleanup.worker';
import RampState from '../../models/rampState.model';

mock.module('../../config/logger', () => ({
  default: {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  },
}));

type ProcessResult = readonly [boolean, Error | null];

const mockPendulumHandler = {
  shouldProcess: mock((state: any) => true),
  process: mock(async (): Promise<ProcessResult> => [true, null]),
  getCleanupName: () => 'pendulum',
};

const mockStellarHandler = {
  shouldProcess: mock((state: any) => true),
  process: mock(async (): Promise<ProcessResult> => [true, null]),
  getCleanupName: () => 'stellar',
};

mock.module('../services/phases/post-process', () => ({
  postProcessHandlers: [mockPendulumHandler, mockStellarHandler],
}));

const updateMock = mock((values: any, options: any) => {
  return Promise.resolve([1, []]);
});
RampState.update = updateMock as any;

/**
 * Unit tests for processCleanup method in CleanupWorker.
 */
describe('CleanupWorker - processCleanup', () => {
  let cleanupWorker: CleanupWorker;
  let testState: any;

  beforeEach(() => {
    cleanupWorker = new CleanupWorker();

    testState = {
      id: 'test-state-id',
      currentPhase: 'complete',
      postCompleteState: {
        cleanup: {
          cleanupCompleted: false,
          errors: null,
        },
      },
    };

    mockPendulumHandler.shouldProcess.mockClear();
    mockPendulumHandler.process.mockClear();
    mockStellarHandler.shouldProcess.mockClear();
    mockStellarHandler.process.mockClear();
    updateMock.mockClear();
  });

  it('should process all applicable handlers successfully', async () => {
    mockPendulumHandler.process.mockImplementation(async () => [true, null] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await (cleanupWorker as any).processCleanup(testState);

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

    expect(values.postCompleteState.cleanup.cleanupCompleted).toBe(true);
    expect(values.postCompleteState.cleanup.errors).toBe(null);

    expect(options.where.id).toBe(testState.id);
  });

  it('should handle one handler failing and track the error', async () => {
    // Setup one handler to fail
    const testError = new Error('Test failure');
    mockPendulumHandler.process.mockImplementation(async () => [false, testError] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await (cleanupWorker as any).processCleanup(testState);

    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);
    expect(mockStellarHandler.process).toHaveBeenCalledTimes(1);

    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    // Verify the update data
    expect(values.postCompleteState.cleanup.cleanupCompleted).toBe(false);
    expect(values.postCompleteState.cleanup.errors).toEqual([{ name: 'pendulum', error: 'Test failure' }]);
  });

  it('should only retry failed handlers on subsequent attempts', async () => {
    testState.postCompleteState.cleanup.errors = [{ name: 'pendulum', error: 'Previous failure' }];

    // Setup both handlers to succeed this time
    mockPendulumHandler.process.mockImplementation(async () => [true, null] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [true, null] as ProcessResult);

    await (cleanupWorker as any).processCleanup(testState);

    // The pendulum handler should be processed again (because it failed before)
    expect(mockPendulumHandler.process).toHaveBeenCalledTimes(1);

    // The stellar handler should NOT be processed again (since it didn't fail before)
    expect(mockStellarHandler.process).toHaveBeenCalledTimes(0);

    // Verify errors are cleared when handler succeeds
    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    // Verify the update data. All errors should be cleared.
    expect(values.postCompleteState.cleanup.cleanupCompleted).toBe(true);
    expect(values.postCompleteState.cleanup.errors).toBe(null);
  });

  it('should properly track errors for multiple failed handlers', async () => {
    mockPendulumHandler.process.mockImplementation(async () => [false, new Error('Pendulum failure')] as ProcessResult);
    mockStellarHandler.process.mockImplementation(async () => [false, new Error('Stellar failure')] as ProcessResult);

    await (cleanupWorker as any).processCleanup(testState);

    expect(updateMock).toHaveBeenCalledTimes(1);

    const [values] = updateMock.mock.calls[0];

    expect(values.postCompleteState.cleanup.cleanupCompleted).toBe(false);

    const errors = values.postCompleteState.cleanup.errors;
    expect(errors).toHaveLength(2);
    expect(errors.some((e: any) => e.name === 'pendulum' && e.error === 'Pendulum failure')).toBe(true);
    expect(errors.some((e: any) => e.name === 'stellar' && e.error === 'Stellar failure')).toBe(true);
  });
});
