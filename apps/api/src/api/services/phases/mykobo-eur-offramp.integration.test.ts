import { describe, expect, it, mock } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Big from "big.js";
import { Keyring } from "@polkadot/api";
import { mnemonicGenerate } from "@polkadot/util-crypto";

// Mock the EVM Nabla swap quote function before importing QuoteService so the
// quote engine does not hit Base RPC for the (currently illiquid) USDC<->EURC pool.
mock.module("../quote/core/nabla", () => {
  return {
    calculateNablaSwapOutputEvm: async (request: {
      inputAmountForSwap: string;
      inputTokenDetails: { decimals: number };
      outputTokenDetails: { decimals: number };
    }) => {
      console.log("[MOCK] calculateNablaSwapOutputEvm called with", request.inputAmountForSwap);
      const decimalOut = new Big(request.inputAmountForSwap).times("0.92");
      const rawOut = decimalOut.times(new Big(10).pow(request.outputTokenDetails.decimals)).toFixed(0, 0);
      return {
        effectiveExchangeRate: "0.92",
        nablaOutputAmountDecimal: decimalOut,
        nablaOutputAmountRaw: rawOut
      };
    },
    calculateNablaSwapOutput: async () => {
      throw new Error("calculateNablaSwapOutput should not be called in EVM-only test");
    }
  };
});

// The Mykobo email is now derived from the user's profile and gated on an APPROVED Mykobo customer
// (resolveMykoboCustomerForUser). This contract test focuses on the Mykobo intent/transaction path,
// so stub the resolver to return the test email instead of standing up profile + KYC-mirror rows.
mock.module("../mykobo/mykobo-customer.service", () => ({
  resolveMykoboCustomerForUser: async () => ({ email: "mail@test.com" }),
  syncMykoboCustomerKyc: async () => {},
  upsertMykoboCustomerFromProfile: async () => {}
}));
import {
  AccountMeta,
  BrlaApiService,
  DestinationType,
  EPaymentMethod,
  EphemeralAccount,
  EphemeralAccountType,
  EvmToken,
  FiatToken,
  MYKOBO_ACCESS_KEY,
  MYKOBO_BASE_URL,
  MYKOBO_SECRET_KEY,
  MykoboApiService,
  MykoboCurrency,
  MykoboFeeKind,
  MykoboTransactionStatus,
  MykoboTransactionType,
  Networks,
  RampDirection,
  RegisterRampRequest
} from "@vortexfi/shared";
import { UpdateOptions } from "sequelize";
import QuoteTicket, { QuoteTicketAttributes, QuoteTicketCreationAttributes } from "../../../models/quoteTicket.model";
import RampState, { RampStateAttributes, RampStateCreationAttributes } from "../../../models/rampState.model";
import RampRecoveryWorker from "../../workers/ramp-recovery.worker";
import { QuoteService } from "../quote";
import { RampService } from "../ramp/ramp.service";
import registerPhaseHandlers from "./register-handlers";
import { StateMetadata } from "./meta-state-types";

const EVM_TESTING_ADDRESS = "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3";
const EVM_DESTINATION_ADDRESS = "0x7ba99e99bc669b3508aff9cc0a898e869459f877";
const TEST_INPUT_AMOUNT = "35";
const TEST_EMAIL = "mail@test.com";
const TEST_IP_ADDRESS = "203.0.113.42";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

const filePath = path.join(__dirname, "lastRampStateMykoboEur.json");
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

interface TestSigningAccounts {
  EVM: EphemeralAccount;
  Substrate: EphemeralAccount;
}

async function createSubstrateEphemeral(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: "sr25519" });
  await new Promise(resolve => setTimeout(resolve, 1000));
  const kp = keyring.addFromUri(seedPhrase);
  return { address: kp.address, secret: seedPhrase };
}

async function createMoonbeamEphemeralSeed(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: "ethereum" });
  const kp = keyring.addFromUri(`${seedPhrase}/m/44'/60'/0'/0/0`);
  return { address: kp.address, secret: seedPhrase };
}

const testSigningAccounts: TestSigningAccounts = {
  EVM: await createMoonbeamEphemeralSeed(),
  Substrate: await createSubstrateEphemeral()
};

const testSigningAccountsMeta: AccountMeta[] = Object.keys(testSigningAccounts).map(networkKey => ({
  address: testSigningAccounts[networkKey as keyof TestSigningAccounts].address,
  type: networkKey as EphemeralAccountType
}));

let rampState: RampState;
let quoteTicket: QuoteTicket;

type RampStateUpdateData = Partial<RampStateAttributes>;
type QuoteTicketUpdateData = Partial<QuoteTicketAttributes>;

RampState.update = mock(async function (updateData: RampStateUpdateData) {
  rampState = { ...rampState, ...updateData, updatedAt: new Date() } as RampState;
  fs.writeFileSync(filePath, JSON.stringify(rampState, null, 2));
  return rampState;
}) as unknown as typeof RampState.update;

RampState.findByPk = mock(async (_id: string): Promise<RampState | null> => rampState) as typeof RampState.findByPk;

RampState.create = mock(async (data: RampStateCreationAttributes): Promise<RampState> => {
  rampState = {
    ...data,
    createdAt: new Date(),
    id: data.id || "test-mykobo-ramp-id",
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

QuoteTicket.findByPk = mock(async (_id: string): Promise<QuoteTicket | null> => quoteTicket) as typeof QuoteTicket.findByPk;

QuoteTicket.update = mock(async (data: QuoteTicketUpdateData) => {
  quoteTicket = { ...quoteTicket, ...data } as QuoteTicket;
  return [1, [quoteTicket]];
}) as unknown as typeof QuoteTicket.update;

QuoteTicket.create = mock(async (data: QuoteTicketCreationAttributes): Promise<QuoteTicket> => {
  quoteTicket = {
    ...data,
    createdAt: new Date(),
    id: data.id || "test-mykobo-quote-id",
    update: async function (
      updateData: QuoteTicketUpdateData,
      _options?: UpdateOptions<QuoteTicketAttributes>
    ): Promise<QuoteTicket> {
      quoteTicket = { ...quoteTicket, ...updateData } as QuoteTicket;
      return quoteTicket;
    },
    updatedAt: new Date()
  } as QuoteTicket;
  return quoteTicket;
}) as typeof QuoteTicket.create;

const mockBrlaApiService = {
  acknowledgeEvents: mock(async (): Promise<void> => Promise.resolve()),
  createFastQuote: mock(async () => ({ basePrice: "100" })),
  createSubaccount: mock(async () => ({ id: "subaccount123" })),
  generateBrCode: mock(async () => ({ brCode: "brcode123" })),
  getAllEventsByUser: mock(async () => []),
  getOnChainHistoryOut: mock(async () => []),
  getPayInHistory: mock(async () => []),
  getSubaccount: mock(async () => ({ brCode: "brcode123", wallets: { evm: EVM_DESTINATION_ADDRESS } })),
  login: mock(async (): Promise<void> => Promise.resolve()),
  sendRequest: mock(async () => ({})),
  swapRequest: mock(async () => ({ id: "swap123" })),
  triggerOfframp: mock(async () => ({ id: "offramp123" })),
  validatePixKey: mock(async () => ({ bankName: "Test Bank", name: "Test", taxId: "x" }))
};

BrlaApiService.getInstance = mock(() => mockBrlaApiService as unknown as BrlaApiService);

RampRecoveryWorker.prototype.start = mock(async (): Promise<void> => {
  // worker disabled in test
});

describe("Mykobo EUR offramp contract test (real sandbox, no on-chain submission)", () => {
  it("requires Mykobo sandbox credentials in the environment", () => {
    if (!MYKOBO_ACCESS_KEY || !MYKOBO_SECRET_KEY) {
      throw new Error("MYKOBO_ACCESS_KEY and MYKOBO_SECRET_KEY must be set to run this test");
    }
    expect(MYKOBO_BASE_URL).toMatch(/mykobo/);
  });

  it("hits Mykobo /fees and returns a numeric total for WITHDRAW", async () => {
    const mykobo = MykoboApiService.getInstance();
    const fees = await mykobo.lookupFees({ kind: MykoboFeeKind.WITHDRAW, value: TEST_INPUT_AMOUNT });
    console.log("Mykobo /fees response:", fees);
    expect(fees).toBeDefined();
    expect(fees.total).toBeDefined();
    expect(Number.isFinite(Number(fees.total))).toBe(true);
  });

  it("creates a Mykobo WITHDRAW intent and returns withdraw instructions with an EVM address", async () => {
    const mykobo = MykoboApiService.getInstance();
    let intent;
    try {
      intent = await mykobo.createTransactionIntent({
        currency: MykoboCurrency.EURC,
        email_address: TEST_EMAIL,
        ip_address: TEST_IP_ADDRESS,
        transaction_type: MykoboTransactionType.WITHDRAW,
        value: "3.000000",
        wallet_address: testSigningAccounts.EVM.address
      });
    } catch (e) {
      const err = e as { body?: unknown; status?: number };
      console.log("Mykobo intent error status:", err.status);
      console.log("Mykobo intent error body:", JSON.stringify(err.body, null, 2));
      throw e;
    }
    console.log("Mykobo intent response:", JSON.stringify(intent, null, 2));

    expect(intent.transaction).toBeDefined();
    expect(intent.transaction.id).toBeTruthy();
    expect(intent.transaction.reference).toBeTruthy();
    expect(intent.transaction.status).toBeDefined();
    expect(intent.transaction.value).toBeDefined();
    expect(intent.transaction.wallet_address).toBe(testSigningAccounts.EVM.address);
    expect(intent.instructions).toBeDefined();
    if (!intent.instructions || !("address" in intent.instructions)) {
      throw new Error("Expected withdraw instructions with `address` field");
    }
    expect(intent.instructions.address).toMatch(EVM_ADDRESS_REGEX);

    const fetched = await mykobo.getTransaction(intent.transaction.id);
    console.log("Mykobo getTransaction response:", fetched);
    expect(fetched.transaction.id).toBe(intent.transaction.id);
    expect(Object.values(MykoboTransactionStatus)).toContain(fetched.transaction.status as MykoboTransactionStatus);
  });

  it("creates a EUR offramp quote on Base via QuoteService and populates nablaSwapEvm metadata", async () => {
    const quoteService = new QuoteService();

    const quote = await quoteService.createQuote({
      from: Networks.Base as DestinationType,
      inputAmount: TEST_INPUT_AMOUNT,
      inputCurrency: EvmToken.USDC,
      network: Networks.Base,
      outputCurrency: FiatToken.EURC,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.SEPA as DestinationType
    });

    console.log("Quote created:", {
      id: quote.id,
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount,
      totalFeeFiat: quote.totalFeeFiat
    });
    console.log("nablaSwapEvm metadata:", quoteTicket.metadata.nablaSwapEvm);

    expect(quote.inputCurrency).toBe(EvmToken.USDC);
    expect(quote.outputCurrency).toBe(FiatToken.EURC);
    expect(Number(quote.outputAmount)).toBeGreaterThan(0);
    expect(Number(quote.totalFeeFiat)).toBeGreaterThan(0);
    expect(quoteTicket.metadata.nablaSwapEvm).toBeDefined();
    expect(quoteTicket.metadata.nablaSwapEvm?.outputAmountDecimal).toBeDefined();
    expect(quoteTicket.metadata.nablaSwapEvm?.outputAmountRaw).toBeDefined();
    expect(Number(quoteTicket.metadata.nablaSwapEvm?.outputAmountDecimal)).toBeGreaterThan(0);
  });

  it("registers a Base+USDC ramp and prepares the Mykobo phase set (no squid, no broadcast)", async () => {
    const rampService = new RampService();
    const quoteService = new QuoteService();

    registerPhaseHandlers();

    const quote = await quoteService.createQuote({
      from: Networks.Base as DestinationType,
      inputAmount: TEST_INPUT_AMOUNT,
      inputCurrency: EvmToken.USDC,
      network: Networks.Base,
      outputCurrency: FiatToken.EURC,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.SEPA as DestinationType
    });

    const additionalData: RegisterRampRequest["additionalData"] = {
      destinationAddress: EVM_DESTINATION_ADDRESS,
      email: TEST_EMAIL,
      ipAddress: TEST_IP_ADDRESS,
      walletAddress: EVM_TESTING_ADDRESS
    };

    const registered = await rampService.registerRamp({
      additionalData,
      quoteId: quote.id,
      signingAccounts: testSigningAccountsMeta,
      userId: TEST_USER_ID
    });

    if (!registered.unsignedTxs) {
      throw new Error("Expected registerRamp to return unsigned transactions");
    }

    const phases = registered.unsignedTxs.map(tx => tx.phase);
    console.log("Prepared phases:", phases);

    expect(phases).not.toContain("squidRouterApprove");
    expect(phases).not.toContain("squidRouterSwap");
    expect(phases).toContain("nablaApprove");
    expect(phases).toContain("nablaSwap");
    expect(phases).toContain("mykoboPayoutOnBase");
    expect(phases).toContain("baseCleanupUsdc");
    expect(phases).toContain("baseCleanupEurc");
    expect(phases).toContain("baseCleanupAxlUsdc");

    const state = rampState.state as StateMetadata;
    expect(state.mykoboEmail).toBe(TEST_EMAIL);
    expect(state.mykoboTransactionId).toBeTruthy();
    expect(state.mykoboReceivablesAddress).toMatch(EVM_ADDRESS_REGEX);
    expect(state.mykoboTransactionReference).toBeTruthy();
    expect(state.evmEphemeralAddress).toBe(testSigningAccounts.EVM.address);
    console.log("StateMeta (Mykobo fields):", {
      mykoboEmail: state.mykoboEmail,
      mykoboReceivablesAddress: state.mykoboReceivablesAddress,
      mykoboTransactionId: state.mykoboTransactionId,
      mykoboTransactionReference: state.mykoboTransactionReference
    });

    const payoutTx = registered.unsignedTxs.find(tx => tx.phase === "mykoboPayoutOnBase");
    expect(payoutTx).toBeDefined();
    expect(payoutTx?.signer).toBe(testSigningAccounts.EVM.address);
    expect(payoutTx?.network).toBe(Networks.Base);
  });
});
