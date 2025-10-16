import {describe, it, mock} from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  AccountMeta,
  API,
  ApiManager,
  BrlaApiService,
  DestinationType,
  EphemeralAccount,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  RegisterRampRequest,
  signUnsignedTransactions,
} from "@packages/shared";
import {Keyring} from "@polkadot/api";
import {mnemonicGenerate} from "@polkadot/util-crypto";
import Big from "big.js";
import {UpdateOptions} from "sequelize";
import {Keypair} from "stellar-sdk";
import QuoteTicket, {QuoteTicketAttributes, QuoteTicketCreationAttributes} from "../../../models/quoteTicket.model";
import RampState, {RampStateAttributes, RampStateCreationAttributes} from "../../../models/rampState.model";
import RampRecoveryWorker from "../../workers/ramp-recovery.worker";
import {QuoteService} from "../ramp/quote.service";
import {RampService} from "../ramp/ramp.service";
import registerPhaseHandlers from "./register-handlers";

const EVM_TESTING_ADDRESS = "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3";
const EVM_DESTINATION_ADDRESS = "0x7ba99e99bc669b3508aff9cc0a898e869459f877";
const STELLAR_MOCK_ANCHOR_ACCOUNT = "GAXW7RTC4LA3MGNEA3LO626ABUCZBW3FDQPYBTH6VQA5BFHXXYZUQWY7";
const TEST_INPUT_AMOUNT = "1";
const TEST_INPUT_CURRENCY = EvmToken.USDC;
const TEST_OUTPUT_CURRENCY = FiatToken.ARS;

const QUOTE_TO = "sepa";
const QUOTE_FROM = "evm";

const filePath = path.join(__dirname, "lastRampState.json");

interface TestSigningAccounts {
  stellar: EphemeralAccount;
  moonbeam: EphemeralAccount;
  pendulum: EphemeralAccount;
}

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

export async function createSubstrateEphemeral(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: "sr25519" });
  await new Promise(resolve => setTimeout(resolve, 1000));
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { address, secret: ephemeralKeys.secret() };
}

export async function createMoonbeamEphemeralSeed(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: "ethereum" });

  const ephemeralAccountKeypair = keyring.addFromUri(`${seedPhrase}/m/44'/60'/${0}'/${0}/${0}`);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}

const testSigningAccounts: TestSigningAccounts = {
  moonbeam: await createMoonbeamEphemeralSeed(),
  pendulum: await createSubstrateEphemeral(),
  stellar: createStellarEphemeral()
};

const testSigningAccountsMeta: AccountMeta[] = Object.keys(testSigningAccounts).map(networkKey => {
  const address = testSigningAccounts[networkKey as keyof typeof testSigningAccounts].address;
  const network = networkKey as Networks;
  return { address, network };
});

console.log("Test Signing Accounts:", testSigningAccountsMeta);

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
    createdAt: new Date(),
    id: data.id || "test-id",
    reload: async function (_options?: UpdateOptions<RampStateAttributes>): Promise<RampState> {
      return rampState;
    },
    update: async function (
      updateData: RampStateUpdateData,
      _options?: UpdateOptions<RampStateAttributes>
    ): Promise<RampState> {
      rampState = { ...rampState, ...updateData, updatedAt: new Date() } as RampState;

      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      return rampState;
    },
    updatedAt: new Date()
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
    createdAt: new Date(),
    id: data.id || "test-quote-id",
    update: async function (
      updateData: QuoteTicketUpdateData,
      _options?: UpdateOptions<QuoteTicketAttributes>
    ): Promise<QuoteTicket> {
      quoteTicket = { ...quoteTicket, ...updateData } as QuoteTicket;
      return quoteTicket;
    },
    updatedAt: new Date()
  } as QuoteTicket;

  console.log("Created QuoteTicket:", quoteTicket);
  return quoteTicket;
}) as typeof QuoteTicket.create;

const mockSubaccountData: { wallets: { evm: string }; brCode: string } = {
  brCode: "brcode123",
  wallets: {
    evm: EVM_DESTINATION_ADDRESS,
  }
};

const mockBrlaApiService = {
  acknowledgeEvents: mock(async (): Promise<void> => Promise.resolve()),
  createFastQuote: mock(async () => ({ basePrice: "100" })),
  createSubaccount: mock(async () => ({ id: "subaccount123" })),
  generateBrCode: mock(async () => ({ brCode: "brcode123" })),
  getAllEventsByUser: mock(async () => []),
  getOnChainHistoryOut: mock(async () => []),
  getPayInHistory: mock(async () => []),
  getSubaccount: mock(async (): Promise<{ wallets: { evm: string }; brCode: string }> => mockSubaccountData),
  login: mock(async (): Promise<void> => Promise.resolve()),
  sendRequest: mock(async () => ({})),
  swapRequest: mock(async () => ({ id: "swap123" })),
  triggerOfframp: mock(async () => ({ id: "offramp123" })),
  validatePixKey: mock(async () => ({
    bankName: "Test Bank",
    name: "Test Receiver",
    taxId: "758.444.017-77"
  }))
};

const mockVerifyReferenceLabel = mock(async (reference: string, receiverAddress: string): Promise<boolean> => {
  console.log("Verifying reference label:", reference, receiverAddress);
  return true;
});

mock.module("../brla/helpers", () => {
  return {
    verifyReferenceLabel: mockVerifyReferenceLabel
  };
});

BrlaApiService.getInstance = mock(() => mockBrlaApiService as unknown as BrlaApiService);

RampService.prototype.validateBrlaOfframpRequest = mock(async (): Promise<{ wallets: { evm: string }; brCode: string }> => mockSubaccountData);

RampRecoveryWorker.prototype.start = mock(async (): Promise<void> => {
  // do nothing
});

describe("PhaseProcessor Integration Test", () => {
  it("should process an offramp (evm -> sepa) through multiple phases until completion", async () => {
    try {
      const rampService = new RampService();
      const quoteService = new QuoteService();

      registerPhaseHandlers();

      const quoteTicket = await quoteService.createQuote({
        from: QUOTE_FROM as DestinationType,
        inputAmount: TEST_INPUT_AMOUNT,
        inputCurrency: TEST_INPUT_CURRENCY,
        network: Networks.Ethereum, // Offramp from EVM network
        outputCurrency: TEST_OUTPUT_CURRENCY,
        rampType: RampDirection.SELL,
        to: QUOTE_TO
      });

      const additionalData: RegisterRampRequest["additionalData"] = {
        paymentData: {
          amount: new Big(quoteTicket.outputAmount).add(new Big(quoteTicket.totalFeeFiat)).toString(),
          anchorTargetAccount: STELLAR_MOCK_ANCHOR_ACCOUNT,
          memo: "1204asjfnaksf10982e4",
          memoType: "text" as const
        },
        pixDestination: "758.444.017-77",
        receiverTaxId: "758.444.017-77",
        taxId: "758.444.017-77",
        walletAddress: EVM_TESTING_ADDRESS
      };

      const registeredRamp = await rampService.registerRamp({
        additionalData,
        quoteId: quoteTicket.id,
        signingAccounts: testSigningAccountsMeta
      });

      console.log("register ramp:", registeredRamp);

      const pendulumNode = await getPendulumNode();
      const moonbeamNode = await getMoonbeamNode();
      const presignedTxs = await signUnsignedTransactions(
        registeredRamp?.unsignedTxs || [],
        {
          moonbeamEphemeral: testSigningAccounts.moonbeam,
          pendulumEphemeral: testSigningAccounts.pendulum,
          stellarEphemeral: testSigningAccounts.stellar
        },
        pendulumNode.api,
        moonbeamNode.api
      );
      console.log("Presigned transactions:", presignedTxs);
    } catch (error: unknown) {
      console.error("Error during test execution:", error);

      fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
      throw error;
    }
  });
});
