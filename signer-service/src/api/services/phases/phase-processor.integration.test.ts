// eslint-disable-next-line import/no-unresolved
import { describe, expect, it, mock, beforeAll } from 'bun:test';
import { PhaseProcessor } from './phase-processor';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import { RampService } from '../ramp/ramp.service';
import { BrlaApiService } from '../brla/brlaApiService';
import { AccountMeta, Networks, RampPhase, PresignedTx, UnsignedTx, RampEndpoints, EvmToken, FiatToken } from 'shared';
import { v4 as uuidv4 } from 'uuid';
import { SubaccountData } from '../brla/types';
import { APIError } from '../../errors/api-error';
import { QuoteService } from '../ramp/quote.service';
import { ApiPromise } from '@polkadot/api';
// TODO move this to shared, or other file at least
import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { Keypair } from 'stellar-sdk';

export interface EphemeralAccount {
  secret: string;
  address: string;
}
// BACKEND_TEST_STARTER_ACCOUNT = "sleep...... al"
const EVM_TESTING_ADDRESS = '0x50bd2f7b9D912724db25D56C547672Dacd702B33';
// Stellar mock anchor account. US.
const STELLAR_MOCK_ANCHOR_ACCOUNT = 'GDSDQLBVDD5RZYKNDM2LAX5JDNNQOTSZOKECUYEXYMUZMAPXTMDUJCVF';

export async function createSubstrateEphemeral(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: 'sr25519' });
  // wait a second for the keyring to be ready
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { secret: seedPhrase, address: ephemeralAccountKeypair.address };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { secret: ephemeralKeys.secret(), address };
}

// only for onramp....
export async function createMoonbeamEphemeralSeed() {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: 'ethereum' });

  // DO NOT CHANGE THE DERIVATION PATH to be compatible with common ethereum libraries like viem.
  const ephemeralAccountKeypair = keyring.addFromUri(`${seedPhrase}/m/44'/60'/${0}'/${0}/${0}`);

  return { seed: seedPhrase, address: ephemeralAccountKeypair.address };
}

const testSigningAccounts = {
  stellar: createStellarEphemeral(),
  moonbeam: await createMoonbeamEphemeralSeed(),
  pendulum: await createSubstrateEphemeral(),
};

// convert into AccountMeta
const testSigningAccountsMeta: AccountMeta[] = Object.keys(testSigningAccounts).map((networkKey) => {
  const address = testSigningAccounts[networkKey as keyof typeof testSigningAccounts].address;
  const network = networkKey as Networks;
  return { network, address };
});

console.log('Test Signing Accounts:', testSigningAccountsMeta);

// Mock in memory db of the RampState and quoteTicket model
let rampState: RampState;
let quoteTicket: QuoteTicket;

RampState.update = mock(async (data: any) => {
  rampState = { ...rampState, ...data };
  console.log('Updated RampState:', rampState);
  return [1, [rampState]];
}) as any;

RampState.findByPk = mock(async (id: string) => {
  return { dataValues: rampState };
});

RampState.create = mock(async (data: any) => {
  rampState = data;
  return { dataValues: rampState };
}) as any;

QuoteTicket.findByPk = mock(async (id: string) => {
  return { dataValues: quoteTicket };
});

QuoteTicket.create = mock(async (data: any) => {
  quoteTicket = data;
  return { dataValues: quoteTicket };
}) as any;

// Mock the BrlaApiService
const mockSubaccountData: SubaccountData = {
  id: 'subaccount123',
  fullName: 'Test User',
  phone: '+1234567890',
  kyc: {
    level: 2,
    documentData: 'document123',
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
    evm: '0xbrla123',
    tron: 'tron123',
  },
  brCode: 'brcode123',
};

// Mock the BrlaApiService
const mockBrlaApiService = {
  getSubaccount: mock(async () => mockSubaccountData),
  validatePixKey: mock(async () => ({
    name: 'Test Receiver',
    taxId: 'receiver123',
    bankName: 'Test Bank',
  })),
  sendRequest: mock(async () => ({})),
  login: mock(async () => {}),
  triggerOfframp: mock(async () => ({ id: 'offramp123' })),
  createSubaccount: mock(async () => ({ id: 'subaccount123' })),
  getAllEventsByUser: mock(async () => []),
  acknowledgeEvents: mock(async () => {}),
  generateBrCode: mock(async () => ({ brCode: 'brcode123' })),
  getPayInHistory: mock(async () => []),
  createFastQuote: mock(async () => ({ basePrice: '100' })),
  swapRequest: mock(async () => ({ id: 'swap123' })),
  getOnChainHistoryOut: mock(async () => []),
};

BrlaApiService.getInstance = mock(() => mockBrlaApiService as unknown as BrlaApiService);

RampService.prototype.validateBrlaOfframpRequest = mock(async () => mockSubaccountData);

// Leave as is
const generatePresignedTxs = async (unsignedTxs?: UnsignedTx[]) => {
  // Mock implementation that converts unsigned transactions to presigned ones
  return [
    {
      tx_data: '0xmocktxdata',
      phase: 'initial' as RampPhase,
      network: Networks.Moonbeam,
      nonce: 1,
      signer: '0xmoonbeam123',
      signature: '0xmocksignature',
    },
  ] as PresignedTx[];
};

describe('PhaseProcessor Integration Test', () => {
  it('should process an offramp (evm -> sepa) through multiple phases until completion', async () => {
    const processor = new PhaseProcessor();
    const rampService = new RampService();
    const quoteService = new QuoteService();
    const additionalData = {
      walletAddress: EVM_TESTING_ADDRESS,
      paymentData: {
        amount: '0.05', // Relevant for test???
        memoType: 'text',
        memo: '1204asjfnaksf10982e4',
        anchorTargetAccount: STELLAR_MOCK_ANCHOR_ACCOUNT,
      },
    };

    const quoteTicket = await quoteService.createQuote({
      rampType: 'off',
      from: 'polygon',
      to: 'sepa',
      inputAmount: '0.1',
      inputCurrency: EvmToken.USDC,
      outputCurrency: FiatToken.EURC,
    });

    // Of course it would be
    try {
      const registeredRamp = await rampService.registerRamp({
        signingAccounts: testSigningAccountsMeta,
        quoteId: quoteTicket.id,
        additionalData,
      });

      // sign and send correspinding squid transactions on mainnet. Then proceed.

      const presignedTxs = await generatePresignedTxs(registeredRamp.unsignedTxs);

      const startedRamp = await rampService.startRamp({ rampId: registeredRamp.id, presignedTxs });

      // await here, start ramp  does not wait. Poll for completion or failure.
      await new Promise((resolve) => setTimeout(resolve, 1000000));
      await processor.processRamp(registeredRamp.id);
    } catch (error) {
      console.error(error);
    }

    expect(rampState.currentPhase).toBe('complete');

    expect(rampState.phaseHistory.length).toBeGreaterThan(1);
  });
});
