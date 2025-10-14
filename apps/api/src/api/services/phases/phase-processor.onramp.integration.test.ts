// eslint-disable-next-line import/no-unresolved
import {describe, expect, it, mock} from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  AccountMeta,
  API,
  ApiManager,
  EphemeralAccount,
  EphemeralAccountType,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  signUnsignedTransactions
} from "@packages/shared";
import {Keyring} from "@polkadot/api";
import {mnemonicGenerate} from "@polkadot/util-crypto";
import {Keypair} from "stellar-sdk";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import {QuoteService} from "../quote";
import {RampService} from "../ramp/ramp.service";
import {PhaseProcessor} from "./phase-processor";
import registerPhaseHandlers from "./register-handlers";

const TAX_ID = process.env.TAX_ID;

// BACKEND_TEST_STARTER_ACCOUNT = "sleep...... al"
// This is the derivation obtained using mnemonicToSeedSync(BACKEND_TEST_STARTER_ACCOUNT!) and HDKey.fromMasterSeed(seed)
const EVM_TESTING_ADDRESS = "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3";
const EVM_DESTINATION_ADDRESS = "12mkWe8Lfsk4Qx6EEocvRDpzmA6SQQHBA4Fq3b9T9cyPr7Td"; // Controlled by us, so funds can arrive here during tests.

const TEST_INPUT_AMOUNT = "1";
const TEST_INPUT_CURRENCY = FiatToken.BRL;
const TEST_OUTPUT_CURRENCY = EvmToken.USDC;

const QUOTE_FROM = "pix";

const filePath = path.join(__dirname, "lastRampStateOnramp.json");

async function getPendulumNode(): Promise<API> {
  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  return await apiManager.getApi(networkName);
}

async function getMoonbeamNode(): Promise<API> {
  const apiManager = ApiManager.getInstance();
  const networkName = "moonbeam";
  return await apiManager.getApi(networkName);
}

async function getHydrationNode(): Promise<API> {
  const apiManager = ApiManager.getInstance();
  const networkName = "hydration";
  return await apiManager.getApi(networkName);
}

export async function createSubstrateEphemeral(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: "sr25519" });
  // wait a second for the keyring to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { address, secret: ephemeralKeys.secret() };
}

// only for onramp....
export async function createMoonbeamEphemeralSeed() {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: "ethereum" });

  // DO NOT CHANGE THE DERIVATION PATH to be compatible with common ethereum libraries like viem.
  const ephemeralAccountKeypair = keyring.addFromUri(`${seedPhrase}/m/44'/60'/${0}'/${0}/${0}`);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}

const testSigningAccounts = {
  moonbeam: await createMoonbeamEphemeralSeed(),
  pendulum: await createSubstrateEphemeral(),
  stellar: createStellarEphemeral()
};

// convert into AccountMeta
const testSigningAccountsMeta: AccountMeta[] = Object.keys(testSigningAccounts).map(networkKey => {
  const address = testSigningAccounts[networkKey as keyof typeof testSigningAccounts].address;
  const network = networkKey as EphemeralAccountType;
  return { address, type: network };
});

console.log("Test Signing Accounts:", testSigningAccountsMeta);

// Mock in memory db of the RampState and quoteTicket model
let rampState: RampState;
let quoteTicket: QuoteTicket;

RampState.update = mock(async function (updateData: any, _options?: any) {
  // Merge the update into the current instance.
  rampState = { ...rampState, ...updateData, updatedAt: new Date() };

  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as any;

RampState.findByPk = mock(async (_id: string) => {
  return rampState;
});

RampState.create = mock(async (data: any) => {
  rampState = {
    ...data,
    createdAt: new Date(),
    reload: async function (_options?: any) {
      return rampState;
    },
    update: async function (updateData: any, _options?: any) {
      // Merge the update into the current instance.
      rampState = { ...rampState, ...updateData, updatedAt: new Date() };
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    updatedAt: new Date()
  };
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as any;

QuoteTicket.findByPk = mock(async (_id: string) => {
  return quoteTicket;
});

QuoteTicket.update = mock(async (data: any) => {
  quoteTicket = { ...quoteTicket, ...data };
  return [1, [quoteTicket]];
}) as any;

QuoteTicket.create = mock(async (data: any) => {
  quoteTicket = {
    ...data,
    update: async function (updateData: any, _options?: any) {
      quoteTicket = { ...quoteTicket, ...updateData };
      return quoteTicket;
    }
  };
  console.log("Created QuoteTicket:", quoteTicket);
  return quoteTicket;
}) as any;

const mockVerifyReferenceLabel = mock(async (reference: any, receiverAddress: any) => {
  console.log("Verifying reference label:", reference, receiverAddress);
  return true;
});

mock.module("../brla/helpers", () => {
  return {
    verifyReferenceLabel: mockVerifyReferenceLabel
  };
});

describe("Onramp PhaseProcessor Integration Test", () => {
  it("should process an onramp (pix -> evm) through multiple phases until completion", async () => {
    try {
      const _processor = new PhaseProcessor();
      const rampService = new RampService();
      const quoteService = new QuoteService();

      registerPhaseHandlers();

      const additionalData = {
        destinationAddress: EVM_DESTINATION_ADDRESS,
        taxId: TAX_ID,
        walletAddress: EVM_TESTING_ADDRESS
      };

      const quoteTicket = await quoteService.createQuote({
        from: QUOTE_FROM,
        inputAmount: TEST_INPUT_AMOUNT,
        inputCurrency: TEST_INPUT_CURRENCY,
        outputCurrency: TEST_OUTPUT_CURRENCY,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      });

      const registeredRamp = await rampService.registerRamp({
        additionalData,
        quoteId: quoteTicket.id,
        signingAccounts: testSigningAccountsMeta
      });

      console.log("register onramp:", registeredRamp);

      // START - MIMIC THE UI

      // At this stage, user would send the BRL through pix.

      // END - MIMIC THE UI

      await rampService.startRamp({
        rampId: registeredRamp.id
      });

      const pendulumNode = await getPendulumNode();
      const moonbeamNode = await getMoonbeamNode();
      const hydrationNode = await getHydrationNode();

      const presignedTxs = await signUnsignedTransactions(
        registeredRamp?.unsignedTxs,
        {
          evmEphemeral: testSigningAccounts.moonbeam,
          substrateEphemeral: testSigningAccounts.pendulum,
          stellarEphemeral: testSigningAccounts.stellar
        },
        pendulumNode.api,
        moonbeamNode.api,
        hydrationNode.api,
      );

      await rampService.updateRamp({
        presignedTxs,
        rampId: registeredRamp.id
      });

      const finalRampState = await waitForCompleteRamp(registeredRamp.id);

      // Some sanity checks.
      expect(finalRampState.currentPhase).toBe("complete");
      expect(finalRampState.phaseHistory.length).toBeGreaterThan(1);
    } catch (error) {
      console.error("Error during test execution:", error);
      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});

async function waitForCompleteRamp(_rampId: string) {
  const pollInterval = 10 * 1000; // 10 seconds
  const globalTimeout = 15 * 60 * 1000; // 15 minutes
  const stalePhaseTimeout = 5 * 60 * 1000; // 5 minutes

  const startTime = Date.now();
  let lastUpdated = new Date(rampState.createdAt).getTime(); // Will be creation time on the first iteration.

  while (true) {
    const currentState = rampState;

    if (currentState.currentPhase === "complete") {
      return currentState;
    }
    const currentUpdated = new Date(currentState.updatedAt).getTime();
    if (currentUpdated > lastUpdated) {
      lastUpdated = currentUpdated;
    }

    if (Date.now() - lastUpdated > stalePhaseTimeout) {
      throw new Error("Ramp state has been stale for more than 5 minutes.");
    }

    if (Date.now() - startTime > globalTimeout) {
      throw new Error("Global timeout of 15 minutes reached without completing the ramp process.");
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}
