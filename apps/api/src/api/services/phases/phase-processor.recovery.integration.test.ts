import { beforeAll, describe, it, mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import RampState, { RampStateAttributes, RampStateCreationAttributes } from '../../../models/rampState.model';
import { PhaseProcessor } from './phase-processor';
import registerPhaseHandlers from './register-handlers';

const RAMP_STATE_RECOVERY = {
  // ...
};

// Mock the RampRecoveryWorker
mock.module('../../workers/ramp-recovery.worker', () => ({
  default: class MockRampRecoveryWorker {
    start = mock(() => {
      // Mock implementation
    });
    stop = mock(() => {
      // Mock implementation
    });
  },
}));

let rampState: RampState;

// Proper Sequelize types
type RampStateUpdateData = Partial<RampStateAttributes>;

const filePath = path.join(__dirname, 'failedRampStateRecovery.json');

beforeAll(() => {
  rampState = {
    ...RAMP_STATE_RECOVERY,
    update: async function (updateData: RampStateUpdateData, _options?: unknown) {
      rampState = { ...rampState, ...updateData } as unknown as RampState;
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (_options?: unknown) {
      return rampState;
    },
  } as unknown as RampState;
});

// Mock RampState.update - static method returns [affectedCount, affectedRows]
RampState.update = mock(async function (updateData: RampStateUpdateData, _options?: unknown) {
  rampState = { ...rampState, ...updateData } as unknown as RampState;
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return [1, [rampState]]; // Return tuple as expected by Sequelize
}) as unknown as typeof RampState.update;

RampState.findByPk = mock(async (_id: string) => {
  return {
    ...rampState,
    update: async function (updateData: RampStateUpdateData, _options?: unknown) {
      rampState = { ...rampState, ...updateData } as unknown as RampState;
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (_options?: unknown) {
      return rampState;
    },
  };
}) as typeof RampState.findByPk;

RampState.create = mock(async (data: RampStateCreationAttributes) => {
  rampState = {
    ...data,
    id: data.id || 'test-recovery-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    update: async function (updateData: RampStateUpdateData, _options?: unknown) {
      rampState = { ...rampState, ...updateData } as unknown as RampState;
      return rampState;
    },
    reload: async function (_options?: unknown) {
      return rampState;
    },
  } as unknown as RampState;
  return rampState;
}) as typeof RampState.create;

describe('Restart PhaseProcessor Integration Test', () => {
  it('should re-start an offramp (evm -> sepa) through multiple phases until completion', async () => {
    try {
      const processor = new PhaseProcessor();

      // wait for handlers to be registered
      registerPhaseHandlers();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await processor.processRamp(rampState.id);

      await new Promise((resolve) => setTimeout(resolve, 3000000)); // 3000 seconds timeout is reasonable for THIS test.
    } catch (error) {
      const filePath = path.join(__dirname, 'failedRampStateRecovery.json');
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});
