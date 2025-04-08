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
import { createPublicClient, createWalletClient, formatGwei, gweiUnits, http, parseGwei } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { BACKEND_TEST_STARTER_ACCOUNT } from '../../../constants/constants';

import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import rampRecoveryWorker from '../../workers/ramp-recovery.worker';
import registerPhaseHandlers from './register-handlers';
import { verifyReferenceLabel } from '../brla/helpers';

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const TAX_ID = process.env.TAX_ID;

// BACKEND_TEST_STARTER_ACCOUNT = "sleep...... al"
// This is the derivation obtained using mnemonicToSeedSync(BACKEND_TEST_STARTER_ACCOUNT!) and HDKey.fromMasterSeed(seed)
const EVM_TESTING_ADDRESS = '0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3';
const EVM_DESTINATION_ADDRESS = '0x7ba99e99bc669b3508aff9cc0a898e869459f877'; // Controlled by us, so funds can arrive here during tests.

const TEST_INPUT_AMOUNT = '1';
const TEST_INPUT_CURRENCY = FiatToken.BRL;
const TEST_OUTPUT_CURRENCY = EvmToken.USDC;

const QUOTE_TO = 'polygon';
const QUOTE_FROM = 'pix';

const filePath = path.join(__dirname, 'lastRampStateOnramp.json');

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
  rampState = { ...rampState, ...updateData };

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
      rampState = { ...rampState, ...updateData };
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    reload: async function (options?: any) {
      return rampState;
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as any;

QuoteTicket.findByPk = mock(async (id: string) => {
  return quoteTicket;
});

QuoteTicket.update = mock(async (data: any) => {
  quoteTicket = { ...quoteTicket, ...data };
  return [1, [quoteTicket]];
}) as any;

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

const mockVerifyReferenceLabel = mock(async (reference: any, receiverAddress: any) => {
  console.log('Verifying reference label:', reference, receiverAddress);
  return true;
});

mock.module('../brla/helpers', () => {
  return {
    verifyReferenceLabel: mockVerifyReferenceLabel,
  };
});

rampRecoveryWorker.start = mock(async () => ({}));

describe('Onramp PhaseProcessor Integration Test', () => {
  it('should process an onramp (pix -> evm) through multiple phases until completion', async () => {
    try {
      const processor = new PhaseProcessor();
      const rampService = new RampService();
      const quoteService = new QuoteService();

      registerPhaseHandlers();

      const additionalData = {
        walletAddress: EVM_TESTING_ADDRESS,
        taxId: TAX_ID,
        destinationAddress: EVM_DESTINATION_ADDRESS,
      };

      const quoteTicket = await quoteService.createQuote({
        rampType: 'on',
        from: QUOTE_FROM,
        to: QUOTE_TO,
        inputAmount: TEST_INPUT_AMOUNT,
        inputCurrency: TEST_INPUT_CURRENCY,
        outputCurrency: TEST_OUTPUT_CURRENCY,
      });

      let registeredRamp = await rampService.registerRamp({
        signingAccounts: testSigningAccountsMeta,
        quoteId: quoteTicket.id,
        additionalData,
      });

      console.log('register onramp:', registeredRamp);

      // START - MIMIC THE UI

      const pendulumNode = await getPendulumNode();
      const moonbeamNode = await getMoonbeamNode();
      const presignedTxs = await signUnsignedTransactions(
        registeredRamp!.unsignedTxs,
        {
          stellarEphemeral: testSigningAccounts.stellar,
          pendulumEphemeral: testSigningAccounts.pendulum,
          evmEphemeral: testSigningAccounts.moonbeam,
        },
        pendulumNode.api,
        moonbeamNode.api,
      );

      // At this stage, user would send the BRL through pix.

      // END - MIMIC THE UI

      const startedRamp = await rampService.startRamp({ rampId: registeredRamp.id, presignedTxs });

      await new Promise((resolve) => setTimeout(resolve, 3000000)); // 3000 seconds timeout is reasonable for THIS test.

      // expect(rampState.currentPhase).toBe('complete');
      // expect(rampState.phaseHistory.length).toBeGreaterThan(1);
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

    console.log('gas parameters', estimateFeePerGas.maxFeePerGas, estimateFeePerGas.maxPriorityFeePerGas);
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
