import { describe, it, mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  AccountMeta,
  DestinationType,
  EvmToken,
  FiatToken,
  Networks,
  RegisterRampRequest,
  signUnsignedTransactions,
} from '@packages/shared';
import { EphemeralAccount } from '@packages/shared';
import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import Big from 'big.js';
import { UpdateOptions } from 'sequelize';
import { Keypair } from 'stellar-sdk';
import QuoteTicket, { QuoteTicketAttributes, QuoteTicketCreationAttributes } from '../../../models/quoteTicket.model';
import RampState, { RampStateAttributes, RampStateCreationAttributes } from '../../../models/rampState.model';
import RampRecoveryWorker from '../../workers/ramp-recovery.worker';
import { BrlaApiService } from '../brla/brlaApiService';
import { SubaccountData } from '../brla/types';
import { API, ApiManager } from '../pendulum/apiManager';
import { QuoteService } from '../ramp/quote.service';
import { RampService } from '../ramp/ramp.service';
import registerPhaseHandlers from './register-handlers';

const EVM_TESTING_ADDRESS = '0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3';
const EVM_DESTINATION_ADDRESS = '0x7ba99e99bc669b3508aff9cc0a898e869459f877';
const STELLAR_MOCK_ANCHOR_ACCOUNT = 'GAXW7RTC4LA3MGNEA3LO626ABUCZBW3FDQPYBTH6VQA5BFHXXYZUQWY7';
const TEST_INPUT_AMOUNT = '1';
const TEST_INPUT_CURRENCY = EvmToken.USDC;
const TEST_OUTPUT_CURRENCY = FiatToken.ARS;

const QUOTE_TO = 'sepa';
const QUOTE_FROM = 'evm';

const filePath = path.join(__dirname, 'lastRampState.json');

interface TestSigningAccounts {
  stellar: EphemeralAccount;
  moonbeam: EphemeralAccount;
  pendulum: EphemeralAccount;
}

async function getPendulumNode(): Promise<API> {
  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  return await apiManager.getApi(networkName);
}

async function getMoonbeamNode(): Promise<API> {
  const apiManager = ApiManager.getInstance();
  const networkName = 'moonbeam';
  return await apiManager.getApi(networkName);
}

export async function createSubstrateEphemeral(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: 'sr25519' });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { secret: seedPhrase, address: ephemeralAccountKeypair.address };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { secret: ephemeralKeys.secret(), address };
}

export async function createMoonbeamEphemeralSeed(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: 'ethereum' });

  const ephemeralAccountKeypair = keyring.addFromUri(`${seedPhrase}/m/44'/60'/${0}'/${0}/${0}`);

  return { secret: seedPhrase, address: ephemeralAccountKeypair.address };
}

const testSigningAccounts: TestSigningAccounts = {
  stellar: createStellarEphemeral(),
  moonbeam: await createMoonbeamEphemeralSeed(),
  pendulum: await createSubstrateEphemeral(),
};

const testSigningAccountsMeta: AccountMeta[] = Object.keys(testSigningAccounts).map((networkKey) => {
  const address = testSigningAccounts[networkKey as keyof typeof testSigningAccounts].address;
  const network = networkKey as Networks;
  return { network, address };
});

console.log('Test Signing Accounts:', testSigningAccountsMeta);

let rampState: RampState;
let quoteTicket: QuoteTicket;

// Proper Sequelize types
type RampStateUpdateData = Partial<RampStateAttributes>;
type QuoteTicketUpdateData = Partial<QuoteTicketAttributes>;

// Mock RampState.update - static method returns [affectedCount, affectedRows]
RampState.update = mock(async function (updateData: RampStateUpdateData) {
  rampState = { ...rampState, ...updateData, updatedAt: new Date() } as RampState;

  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as unknown as typeof RampState.update;

RampState.findByPk = mock(async (_id: string): Promise<RampState | null> => {
  return rampState;
}) as typeof RampState.findByPk;

RampState.create = mock(async (data: RampStateCreationAttributes): Promise<RampState> => {
  rampState = {
    ...data,
    id: data.id || 'test-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    update: async function (
      updateData: RampStateUpdateData,
      _options?: UpdateOptions<RampStateAttributes>,
    ): Promise<RampState> {
      rampState = { ...rampState, ...updateData, updatedAt: new Date() } as RampState;

      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (_options?: UpdateOptions<RampStateAttributes>): Promise<RampState> {
      return rampState;
    },
  } as RampState;

  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as typeof RampState.create;

QuoteTicket.findByPk = mock(async (_id: string): Promise<QuoteTicket | null> => {
  return quoteTicket;
}) as typeof QuoteTicket.findByPk;

QuoteTicket.create = mock(async (data: QuoteTicketCreationAttributes): Promise<QuoteTicket> => {
  quoteTicket = {
    ...data,
    id: data.id || 'test-quote-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    update: async function (
      updateData: QuoteTicketUpdateData,
      _options?: UpdateOptions<QuoteTicketAttributes>,
    ): Promise<QuoteTicket> {
      quoteTicket = { ...quoteTicket, ...updateData } as QuoteTicket;
      return quoteTicket;
    },
  } as QuoteTicket;

  console.log('Created QuoteTicket:', quoteTicket);
  return quoteTicket;
}) as typeof QuoteTicket.create;

const mockSubaccountData: SubaccountData = {
  id: 'subaccount123',
  fullName: 'Test User',
  phone: '+1234567890',
  kyc: {
    level: 2,
    documentData: '75844401777',
    documentType: 'CPF',
    limits: {
      limitMint: 10000,
      limitBurn: 10000,
      limitSwapBuy: 10000,
      limitSwapSell: 10000,
      limitBRLAOutOwnAccount: 10000,
      limitBRLAOutThirdParty: 10000,
    },
  },
  address: {
    cep: '12345-678',
    city: 'Test City',
    state: 'TS',
    street: 'Test Street',
    number: '123',
    district: 'Test District',
  },
  createdAt: new Date().toISOString(),
  wallets: {
    evm: EVM_DESTINATION_ADDRESS,
    tron: 'tron123',
  },
  brCode: 'brcode123',
};

const mockBrlaApiService = {
  getSubaccount: mock(async (): Promise<SubaccountData> => mockSubaccountData),
  validatePixKey: mock(async () => ({
    name: 'Test Receiver',
    taxId: '758.444.017-77',
    bankName: 'Test Bank',
  })),
  sendRequest: mock(async () => ({})),
  login: mock(async (): Promise<void> => Promise.resolve()),
  triggerOfframp: mock(async () => ({ id: 'offramp123' })),
  createSubaccount: mock(async () => ({ id: 'subaccount123' })),
  getAllEventsByUser: mock(async () => []),
  acknowledgeEvents: mock(async (): Promise<void> => Promise.resolve()),
  generateBrCode: mock(async () => ({ brCode: 'brcode123' })),
  getPayInHistory: mock(async () => []),
  createFastQuote: mock(async () => ({ basePrice: '100' })),
  swapRequest: mock(async () => ({ id: 'swap123' })),
  getOnChainHistoryOut: mock(async () => []),
};

const mockVerifyReferenceLabel = mock(async (reference: string, receiverAddress: string): Promise<boolean> => {
  console.log('Verifying reference label:', reference, receiverAddress);
  return true;
});

mock.module('../brla/helpers', () => {
  return {
    verifyReferenceLabel: mockVerifyReferenceLabel,
  };
});

BrlaApiService.getInstance = mock(() => mockBrlaApiService as unknown as BrlaApiService);

RampService.prototype.validateBrlaOfframpRequest = mock(async (): Promise<SubaccountData> => mockSubaccountData);

RampRecoveryWorker.prototype.start = mock(async (): Promise<void> => {
  // do nothing
});

describe('PhaseProcessor Integration Test', () => {
  it('should process an offramp (evm -> sepa) through multiple phases until completion', async () => {
    try {
      const rampService = new RampService();
      const quoteService = new QuoteService();

      registerPhaseHandlers();

      const quoteTicket = await quoteService.createQuote({
        rampType: 'off',
        from: QUOTE_FROM as DestinationType,
        to: QUOTE_TO,
        inputAmount: TEST_INPUT_AMOUNT,
        inputCurrency: TEST_INPUT_CURRENCY,
        outputCurrency: TEST_OUTPUT_CURRENCY,
      });

      const additionalData: RegisterRampRequest['additionalData'] = {
        walletAddress: EVM_TESTING_ADDRESS,
        paymentData: {
          amount: new Big(quoteTicket.outputAmount).add(new Big(quoteTicket.fee.total)).toString(),
          memoType: 'text' as const,
          memo: '1204asjfnaksf10982e4',
          anchorTargetAccount: STELLAR_MOCK_ANCHOR_ACCOUNT,
        },
        taxId: '758.444.017-77',
        receiverTaxId: '758.444.017-77',
        pixDestination: '758.444.017-77',
      };

      const registeredRamp = await rampService.registerRamp({
        signingAccounts: testSigningAccountsMeta,
        quoteId: quoteTicket.id,
        additionalData,
      });

      console.log('register ramp:', registeredRamp);

      const pendulumNode = await getPendulumNode();
      const moonbeamNode = await getMoonbeamNode();
      const presignedTxs = await signUnsignedTransactions(
        registeredRamp?.unsignedTxs,
        {
          stellarEphemeral: testSigningAccounts.stellar,
          pendulumEphemeral: testSigningAccounts.pendulum,
          moonbeamEphemeral: testSigningAccounts.moonbeam,
        },
        pendulumNode.api,
        moonbeamNode.api,
      );
      console.log('Presigned transactions:', presignedTxs);
    } catch (error: unknown) {
      console.error('Error during test execution:', error);

      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});
