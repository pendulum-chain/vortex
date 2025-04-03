// eslint-disable-next-line import/no-unresolved
import { describe, expect, it, mock, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { PhaseProcessor } from './phase-processor';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import { RampService } from '../ramp/ramp.service';
import { BrlaApiService } from '../brla/brlaApiService';
import {
  AccountMeta,
  Networks,
  RampEndpoints,
  EvmToken,
  FiatToken,
  signUnsignedTransactions,
  EvmTransactionData,
  getNetworkId,
} from 'shared';
import { v4 as uuidv4 } from 'uuid';
import { SubaccountData } from '../brla/types';
import { APIError } from '../../errors/api-error';
import { QuoteService } from '../ramp/quote.service';
import { EphemeralAccount } from 'shared';
import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { Keypair } from 'stellar-sdk';
import { API, ApiManager } from '../pendulum/apiManager';
import { createPublicClient, createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { BACKEND_TEST_STARTER_ACCOUNT } from '../../../constants/constants';

import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';

// BACKEND_TEST_STARTER_ACCOUNT = "sleep...... al"
// This is the derivation obtained using mnemonicToSeedSync(BACKEND_TEST_STARTER_ACCOUNT!) and HDKey.fromMasterSeed(seed)
const EVM_TESTING_ADDRESS = '0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3';
// Stellar mock anchor account. US.
const STELLAR_MOCK_ANCHOR_ACCOUNT = 'GDSDQLBVDD5RZYKNDM2LAX5JDNNQOTSZOKECUYEXYMUZMAPXTMDUJCVF';

async function getPendulumNode(): Promise<API> {
  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  return await apiManager.getApi(networkName);
}

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

  return { secret: seedPhrase, address: ephemeralAccountKeypair.address };
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

RampState.update = mock(async function (updateData: any, options?: any) {
  // Merge the update into the current instance.
  rampState = { ...rampState, ...updateData };
  console.log('Updated RampState:', rampState);
  return rampState;
}) as any;

RampState.findByPk = mock(async (id: string) => {
  return rampState;
});

RampState.create = mock(async (data: any) => {
  rampState = {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
    update: async function (updateData: any, options?: any) {
      // Merge the update into the current instance.
      rampState = { ...rampState, ...updateData };
      console.log('Updated RampState:', rampState);
      return rampState;
    },
    reload: async function (options?: any) {
      console.log('Reloaded RampState:', this);
      return rampState;
    },
  };
  console.log('Created RampState:', rampState);
  return rampState;
}) as any;

QuoteTicket.findByPk = mock(async (id: string) => {
  console.log('Finding QuoteTicket by ID:', id);
  return quoteTicket;
});

// QuoteTicket.update = mock(async (data: any) => {
//   quoteTicket = { ...quoteTicket, ...data };
//   console.log('Updated QuoteTicket:', quoteTicket);
//   return [1, [quoteTicket]];
// }) as any;

QuoteTicket.create = mock(async (data: any) => {
  quoteTicket = {
    ...data,
    update: async function (updateData: any, options?: any) {
      quoteTicket = { ...quoteTicket, ...updateData };
      console.log('Updated QuoteTicket:', quoteTicket);
      return quoteTicket;
    },
  };
  console.log('Created QuoteTicket:', quoteTicket);
  return quoteTicket;
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

describe('PhaseProcessor Integration Test', () => {
  it('should process an offramp (evm -> sepa) through multiple phases until completion', async () => {
    try {
      const processor = new PhaseProcessor();
      const rampService = new RampService();
      const quoteService = new QuoteService();
      const additionalData = {
        walletAddress: EVM_TESTING_ADDRESS,
        paymentData: {
          amount: '1', // Relevant for test???
          memoType: 'text' as 'text', // Explicitly type as literal 'text' to avoid TypeScript error
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

      let registeredRamp = await rampService.registerRamp({
        signingAccounts: testSigningAccountsMeta,
        quoteId: quoteTicket.id,
        additionalData,
      });

      console.log('register ramp:', registeredRamp);

      // START - MIMIC THE UI
      const pendulumNode = await getPendulumNode();
      const presignedTxs = await signUnsignedTransactions(
        registeredRamp!.unsignedTxs,
        {
          stellarEphemeral: testSigningAccounts.stellar,
          pendulumEphemeral: testSigningAccounts.pendulum,
          evmEphemeral: testSigningAccounts.moonbeam,
        },
        pendulumNode.api,
      );
      console.log('Presigned transactions:', presignedTxs);

      // sign and send the squidy transactions!
      const squidApproveTransaction = registeredRamp!.unsignedTxs.find((tx) => tx.phase === 'squidrouterApprove');
      const approveHash = await executeEvmTransaction(
        squidApproveTransaction!.network,
        squidApproveTransaction!.tx_data as EvmTransactionData,
      );
      console.log('Approve transaction executed with hash:', approveHash);

      const squidSwapTransaction = registeredRamp!.unsignedTxs.find((tx) => tx.phase === 'squidrouterSwap');
      const swapHash = await executeEvmTransaction(
        squidSwapTransaction!.network,
        squidSwapTransaction!.tx_data as EvmTransactionData,
      );
      console.log('Swap transaction executed with hash:', swapHash);
      // END - MIMIC THE UI

      //const startedRamp = await rampService.startRamp({ rampId: registeredRamp.id, presignedTxs });
      // wait for handlers to be registered
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      // await processor.processRamp(registeredRamp.id);

      // await new Promise((resolve) => setTimeout(resolve, 3000000)); // 3000 seconds timeout is reasonable for THIS test.

      // expect(rampState.currentPhase).toBe('complete');
      // expect(rampState.phaseHistory.length).toBeGreaterThan(1);
    } catch (error) {
      throw error;
    }
  });
});

async function executeEvmTransaction(network: Networks, txData: EvmTransactionData): Promise<string> {
  try {
    const seed = mnemonicToSeedSync(BACKEND_TEST_STARTER_ACCOUNT!);
    const { privateKey } = HDKey.fromMasterSeed(seed);

    const moonbeamExecutorAccount = privateKeyToAccount(`0x${privateKey!.toHex()}` as `0x${string}`);
    console.log('sanity check derivation, public is: ', moonbeamExecutorAccount.address);
    // const chainId = getNetworkId(network); Need to get the network based on the id.
    const walletClient = createWalletClient({
      account: moonbeamExecutorAccount,
      chain: polygon,
      transport: http(),
    });

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    });

    const hash = await walletClient.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: BigInt(txData.value),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return receipt.transactionHash;
  } catch (error) {
    console.error('Error sending raw EVM transaction', error);
    throw new Error('Failed to send transaction');
  }
}
