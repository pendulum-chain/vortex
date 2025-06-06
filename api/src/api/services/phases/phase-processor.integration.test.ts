// eslint-disable-next-line import/no-unresolved
import { describe, it, mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { PhaseProcessor } from './phase-processor';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import { RampService } from '../ramp/ramp.service';
import { BrlaApiService } from '../brla/brlaApiService';
import { AccountMeta, Networks, EvmToken, FiatToken, signUnsignedTransactions, EvmTransactionData } from 'shared';
import { SubaccountData } from '../brla/types';
import { QuoteService } from '../ramp/quote.service';
import { EphemeralAccount } from 'shared';
import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { Keypair } from 'stellar-sdk';
import { API, ApiManager } from '../pendulum/apiManager';
import { createPublicClient, createWalletClient, formatGwei, gweiUnits, http, parseGwei } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { BACKEND_TEST_STARTER_ACCOUNT } from '../../../constants/constants';

import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import rampRecoveryWorker from '../../workers/ramp-recovery.worker';
import registerPhaseHandlers from './register-handlers';
import Big from 'big.js';

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const TAX_ID = process.env.TAX_ID;
// BACKEND_TEST_STARTER_ACCOUNT = "sleep...... al"
// This is the derivation obtained using mnemonicToSeedSync(BACKEND_TEST_STARTER_ACCOUNT!) and HDKey.fromMasterSeed(seed)
const EVM_TESTING_ADDRESS = '0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3';
const EVM_DESTINATION_ADDRESS = '0x7ba99e99bc669b3508aff9cc0a898e869459f877'; // Controlled by us, so funds can arrive here during tests.
// Stellar mock anchor account. Back to the vault, for now.
const STELLAR_MOCK_ANCHOR_ACCOUNT = 'GAXW7RTC4LA3MGNEA3LO626ABUCZBW3FDQPYBTH6VQA5BFHXXYZUQWY7';
const TEST_INPUT_AMOUNT = '1';
const TEST_INPUT_CURRENCY = EvmToken.USDC;
const TEST_OUTPUT_CURRENCY = FiatToken.ARS;

const QUOTE_TO = 'sepa';
const QUOTE_FROM = 'polygon';

const filePath = path.join(__dirname, 'lastRampState.json');

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
  rampState = { ...rampState, ...updateData, updatedAt: new Date() };

  const filePath = path.join(__dirname, 'lastRampState.json');
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
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
      rampState = { ...rampState, ...updateData, updatedAt: new Date() };

      const filePath = path.join(__dirname, 'lastRampState.json');
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (options?: any) {
      return rampState;
    },
  };
  const filePath = path.join(__dirname, 'lastRampState.json');
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as any;

QuoteTicket.findByPk = mock(async (id: string) => {
  return quoteTicket;
});

QuoteTicket.create = mock(async (data: any) => {
  quoteTicket = {
    ...data,
    update: async function (updateData: any, options?: any) {
      quoteTicket = { ...quoteTicket, ...updateData };
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
    evm: EVM_DESTINATION_ADDRESS, // simulating user's wallet on polygon.
    tron: 'tron123',
  },
  brCode: 'brcode123',
};

// Mock the BrlaApiService
const mockBrlaApiService = {
  getSubaccount: mock(async () => mockSubaccountData),
  validatePixKey: mock(async () => ({
    name: 'Test Receiver',
    taxId: '758.444.017-77',
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

const mockVerifyReferenceLabel = mock(async (reference: any, receiverAddress: any) => {
  console.log('Verifying reference label:', reference, receiverAddress);
  return true;
});

mock.module('../brla/helpers', () => {
  return {
    verifyReferenceLabel: mockVerifyReferenceLabel,
  };
});

BrlaApiService.getInstance = mock(() => mockBrlaApiService as unknown as BrlaApiService);

RampService.prototype.validateBrlaOfframpRequest = mock(async () => mockSubaccountData);

rampRecoveryWorker.start = mock(async () => ({}));

describe('PhaseProcessor Integration Test', () => {
  it('should process an offramp (evm -> sepa) through multiple phases until completion', async () => {
    try {
      const processor = new PhaseProcessor();
      const rampService = new RampService();
      const quoteService = new QuoteService();

      registerPhaseHandlers();

      const additionalData = {
        walletAddress: EVM_TESTING_ADDRESS,
        paymentData: {
          amount: '0.0000000001', // TODO this is user controlled, not only in test, perhaps we should protect. It should come from the quote.
          memoType: 'text' as 'text', // Explicitly type as literal 'text' to avoid TypeScript error
          memo: '1204asjfnaksf10982e4',
          anchorTargetAccount: STELLAR_MOCK_ANCHOR_ACCOUNT,
        },
        taxId: '758.444.017-77',
        receiverTaxId: '758.444.017-77',
        pixDestination: '758.444.017-77',
      };

      const quoteTicket = await quoteService.createQuote({
        rampType: 'off',
        from: QUOTE_FROM,
        to: QUOTE_TO,
        inputAmount: TEST_INPUT_AMOUNT,
        inputCurrency: TEST_INPUT_CURRENCY,
        outputCurrency: TEST_OUTPUT_CURRENCY,
      });

      additionalData.paymentData.amount = new Big(quoteTicket.outputAmount).add(quoteTicket.fee).toString();

      let registeredRamp = await rampService.registerRamp({
        signingAccounts: testSigningAccountsMeta,
        quoteId: quoteTicket.id,
        additionalData,
      });

      console.log('register ramp:', registeredRamp);

      // START - MIMIC THE UI

      const pendulumNode = await getPendulumNode();
      const moonbeamNode = await getMoonbeamNode();
      const presignedTxs = await signUnsignedTransactions(
        registeredRamp!.unsignedTxs,
        {
          stellarEphemeral: testSigningAccounts.stellar,
          pendulumEphemeral: testSigningAccounts.pendulum,
          moonbeamEphemeral: testSigningAccounts.moonbeam,
        },
        pendulumNode.api,
        moonbeamNode.api,
      );
      console.log('Presigned transactions:', presignedTxs);
      // //sign and send the squidy transactions!
      // const squidApproveTransaction = registeredRamp!.unsignedTxs.find((tx) => tx.phase === 'squidRouterApprove');
      // const approveHash = await executeEvmTransaction(
      //   squidApproveTransaction!.network,
      //   squidApproveTransaction!.txData as EvmTransactionData,
      // );
      // console.log('Approve transaction executed with hash:', approveHash);

      // const squidSwapTransaction = registeredRamp!.unsignedTxs.find((tx) => tx.phase === 'squidRouterSwap');
      // const swapHash = await executeEvmTransaction(
      //   squidSwapTransaction!.network,
      //   squidSwapTransaction!.txData as EvmTransactionData,
      // );
      // console.log('Swap transaction executed with hash:', swapHash);

      // // END - MIMIC THE UI

      // const startedRamp = await rampService.startRamp({ rampId: registeredRamp.id, presignedTxs });

      // const finalRampState = await waitForCompleteRamp(registeredRamp.id);

      // // Some sanity checks.
      // expect(finalRampState.currentPhase).toBe('complete');
      // expect(finalRampState.phaseHistory.length).toBeGreaterThan(1);
    } catch (error) {
      console.error('Error during test execution:', error);

      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});

async function executeEvmTransaction(network: Networks, txData: EvmTransactionData): Promise<string> {
  try {
    const seed = mnemonicToSeedSync(BACKEND_TEST_STARTER_ACCOUNT!);
    const { privateKey } = HDKey.fromMasterSeed(seed);

    const moonbeamExecutorAccount = privateKeyToAccount(`0x${privateKey!.toHex()}` as `0x${string}`);
    // const chainId = getNetworkId(network); Need to get the network based on the id.
    const walletClient = createWalletClient({
      account: moonbeamExecutorAccount,
      chain: polygon,
      transport: http(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`),
    });

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`),
    });

    const estimateFeePerGas = await publicClient.estimateFeesPerGas();
    const hash = await walletClient.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: BigInt(txData.value),
      gas: BigInt(txData.gas),
      maxFeePerGas: estimateFeePerGas.maxFeePerGas * 5n,
      maxPriorityFeePerGas: estimateFeePerGas.maxPriorityFeePerGas * 5n,
    });
    console.log('Transaction hash:', hash);
    // we are naive and assume that it will take a maximum of 30 seconds to get into block, and potentially be reverted.
    await new Promise((resolve) => setTimeout(resolve, 30000));
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Transaction receipt:', receipt);
    if (!receipt || receipt.status !== 'success') {
      throw new Error(`Transaction ${hash} failed or was not found`);
    }

    return receipt.transactionHash;
  } catch (error) {
    console.error('Error sending raw EVM transaction', error);
    throw new Error('Failed to send transaction');
  }
}

async function waitForCompleteRamp(rampId: string) {
  const pollInterval = 10 * 1000; // 10 seconds
  const globalTimeout = 15 * 60 * 1000; // 15 minutes
  const stalePhaseTimeout = 5 * 60 * 1000; // 5 minutes

  const startTime = Date.now();
  let lastUpdated = new Date(rampState.createdAt).getTime(); // Will be creation time on the first iteration.

  while (true) {
    const currentState = rampState;

    if (currentState.currentPhase === 'complete') {
      return currentState;
    }
    const currentUpdated = new Date(currentState.updatedAt).getTime();
    if (currentUpdated > lastUpdated) {
      lastUpdated = currentUpdated;
    }

    if (Date.now() - lastUpdated > stalePhaseTimeout) {
      throw new Error('Ramp state has been stale for more than 5 minutes.');
    }

    if (Date.now() - startTime > globalTimeout) {
      throw new Error('Global timeout of 15 minutes reached without completing the ramp process.');
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}
