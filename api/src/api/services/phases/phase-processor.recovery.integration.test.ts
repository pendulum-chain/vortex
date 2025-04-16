// eslint-disable-next-line import/no-unresolved
import { describe, it, mock, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';

import { PhaseProcessor } from './phase-processor';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import { RampService } from '../ramp/ramp.service';
import { BrlaApiService } from '../brla/brlaApiService';
import { SubaccountData } from '../brla/types';

import registerPhaseHandlers from './register-handlers';
import rampRecoveryWorker from '../../workers/ramp-recovery.worker';
import path from 'node:path';
import RAMP_STATE_RECOVERY from './failedRampStateRecovery.json';
//import { RAMP_STATE_RECOVERY } from './ramp-state-recovery';

let rampState: RampState;

const filePath = path.join(__dirname, 'failedRampStateRecovery.json');

beforeAll(() => {
  rampState = {
    ...RAMP_STATE_RECOVERY,
    update: async function (updateData: any, options?: any) {
      rampState = { ...rampState, ...updateData };
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (options?: any) {
      return rampState;
    },
  } as unknown as RampState;
});

RampState.update = mock(async function (updateData: any, options?: any) {
  rampState = { ...rampState, ...updateData };
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as any;

RampState.findByPk = mock(async (id: string) => {
  return {
    ...rampState,
    update: async function (updateData: any, options?: any) {
      rampState = { ...rampState, ...updateData };
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (options?: any) {
      return rampState;
    },
  };
});

RampState.create = mock(async (data: any) => {
  rampState = {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
    update: async function (updateData: any, options?: any) {
      rampState = { ...rampState, ...updateData };
      return rampState;
    },
    reload: async function (options?: any) {
      return rampState;
    },
  };
  return rampState;
}) as any;

// // Mock the BrlaApiService
// const mockSubaccountData: SubaccountData = {
//   id: 'subaccount123',
//   fullName: 'Test User',
//   phone: '+1234567890',
//   kyc: {
//     level: 2,
//     documentData: 'document123',
//     documentType: 'CPF',
//     limits: {
//       limitMint: 10000,
//       limitBurn: 10000,
//       limitSwapBuy: 10000,
//       limitSwapSell: 10000,
//       limitBRLAOutOwnAccount: 10000,
//       limitBRLAOutThirdParty: 10000,
//     },
//   },
//   address: {
//     cep: '12345-678',
//     city: 'Test City',
//     state: 'TS',
//     street: 'Test Street',
//     number: '123',
//     district: 'Test District',
//   },
//   createdAt: new Date().toISOString(),
//   wallets: {
//     evm: '0xbrla123',
//     tron: 'tron123',
//   },
//   brCode: 'brcode123',
// };

// const mockBrlaApiService = {
//   getSubaccount: mock(async () => mockSubaccountData),
//   validatePixKey: mock(async () => ({
//     name: 'Test Receiver',
//     taxId: 'receiver123',
//     bankName: 'Test Bank',
//   })),
//   sendRequest: mock(async () => ({})),
//   login: mock(async () => {}),
//   triggerOfframp: mock(async () => ({ id: 'offramp123' })),
//   createSubaccount: mock(async () => ({ id: 'subaccount123' })),
//   getAllEventsByUser: mock(async () => []),
//   acknowledgeEvents: mock(async () => {}),
//   generateBrCode: mock(async () => ({ brCode: 'brcode123' })),
//   getPayInHistory: mock(async () => []),
//   createFastQuote: mock(async () => ({ basePrice: '100' })),
//   swapRequest: mock(async () => ({ id: 'swap123' })),
//   getOnChainHistoryOut: mock(async () => []),
// };

// BrlaApiService.getInstance = mock(() => mockBrlaApiService as unknown as BrlaApiService);

//RampService.prototype.validateBrlaOfframpRequest = mock(async () => mockSubaccountData);

rampRecoveryWorker.start = mock(async () => ({}));

describe('Restart PhaseProcessor Integration Test', () => {
  it('should re-start an offramp (evm -> sepa) through multiple phases until completion', async () => {
    try {
      const processor = new PhaseProcessor();

      // wait for handlers to be registered
      registerPhaseHandlers();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await processor.processRamp(rampState.id);

      await new Promise((resolve) => setTimeout(resolve, 3000000)); // 3000 seconds timeout is reasonable for THIS test.

      // expect(rampState.currentPhase).toBe('complete');
      // expect(rampState.phaseHistory.length).toBeGreaterThan(1);
    } catch (error) {
      const filePath = path.join(__dirname, 'failedRampStateRecovery.json');
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});
