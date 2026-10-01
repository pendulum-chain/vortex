// Characterization of the register -> store ephemerals -> sign -> update flow shared by the BRL,
// Domestic and EUR handlers: exact API payloads, call order, which transactions reach signing,
// failure ordering and error messages. Run: cd packages/sdk && bun test

import { describe, expect, test } from "bun:test";
import {
  EPaymentMethod,
  EphemeralAccountType,
  FiatToken,
  Networks,
  PresignedTx,
  RampDirection,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx,
  UpdateRampRequest
} from "@vortexfi/shared";
import {
  AmountExceedsLimitError,
  InvalidPixKeyError,
  MissingDomesticOfframpParametersError,
  MissingDomesticOnrampParametersError,
  MissingEurOnrampParametersError,
  MissingMykoboOfframpParametersError,
  VortexSdkError
} from "../src/errors";
import { BrlHandler } from "../src/handlers/BrlHandler";
import { DomesticHandler } from "../src/handlers/DomesticHandler";
import { EurHandler } from "../src/handlers/EurHandler";
import { ApiService } from "../src/services/ApiService";
import type { VortexSdkContext } from "../src/types";

const WALLET = "0x1234567890123456789012345678901234567890";
const DESTINATION = "0x0000000000000000000000000000000000000002";

type Call = { method: string; payload: unknown };

const makeTx = (signer: string, nonce: number): UnsignedTx => ({
  meta: {},
  network: Networks.Polygon,
  nonce,
  phase: "fundEphemeral",
  signer,
  txData: { data: "0x", gas: "21000", to: "0x0000000000000000000000000000000000000003", value: "0" }
});

// One user-owned tx plus one tx per ephemeral. Signers use a different case than the ephemeral
// addresses to pin the case-insensitive match used by the Domestic and EUR handlers.
const userTx = makeTx(WALLET, 0);
const evmEphemeralTx = makeTx("0xevm", 1);
const substrateEphemeralTx = makeTx("5substrate", 2);
const allTxs = [userTx, evmEphemeralTx, substrateEphemeralTx];

const ephemerals = {
  EVM: { address: "0xEVM", secret: "evm-secret" },
  Substrate: { address: "5SUBSTRATE", secret: "substrate-secret" }
};
const accountMetas = [
  { address: "5SUBSTRATE", type: EphemeralAccountType.Substrate },
  { address: "0xEVM", type: EphemeralAccountType.EVM }
];

const makeRamp = (id: string, currentPhase: RampProcess["currentPhase"], unsignedTxs: UnsignedTx[] | undefined): RampProcess =>
  ({
    createdAt: "2026-01-01T00:00:00.000Z",
    currentPhase,
    from: EPaymentMethod.PIX,
    id,
    inputAmount: "100",
    inputCurrency: FiatToken.BRL,
    outputAmount: "10",
    outputCurrency: "USDC",
    paymentMethod: EPaymentMethod.PIX,
    quoteId: "quote_1",
    to: Networks.Polygon,
    type: RampDirection.BUY,
    unsignedTxs,
    updatedAt: "2026-01-01T00:00:00.000Z"
  }) as RampProcess;

interface SetupOptions {
  currentPhase?: RampProcess["currentPhase"];
  unsignedTxs?: UnsignedTx[] | undefined;
  quote?: { inputAmount: string; outputAmount: string; anchorFeeFiat?: string };
  remainingLimit?: () => Promise<{ remainingLimit: number }>;
  validatePixKey?: () => Promise<{ valid: boolean }>;
  storeEphemerals?: () => Promise<void>;
  signTransactions?: () => Promise<PresignedTx[]>;
  generateEphemerals?: () => Promise<unknown>;
}

function setup<H>(Handler: new (...args: ConstructorParameters<typeof BrlHandler>) => H, options: SetupOptions = {}) {
  const calls: Call[] = [];
  const updated = makeRamp("ramp_updated", "initial", undefined);
  const apiService = new ApiService("http://localhost:3000");
  apiService.getQuote = (async (quoteId: string) => {
    calls.push({ method: "getQuote", payload: quoteId });
    return options.quote ?? { inputAmount: "100", outputAmount: "90" };
  }) as ApiService["getQuote"];
  apiService.getBrlRemainingLimit = async (taxId, direction) => {
    calls.push({ method: "getBrlRemainingLimit", payload: [taxId, direction] });
    return options.remainingLimit ? options.remainingLimit() : { remainingLimit: 1_000_000 };
  };
  apiService.validateBrlPixKey = async pixKey => {
    calls.push({ method: "validateBrlPixKey", payload: pixKey });
    return options.validatePixKey ? options.validatePixKey() : { valid: true };
  };
  apiService.getRampStatus = (async (rampId: string) => {
    calls.push({ method: "getRampStatus", payload: rampId });
    return makeRamp(rampId, options.currentPhase ?? "initial", undefined);
  }) as ApiService["getRampStatus"];
  apiService.registerRamp = async (request: RegisterRampRequest) => {
    calls.push({ method: "registerRamp", payload: request });
    return makeRamp("ramp_1", "initial", "unsignedTxs" in options ? options.unsignedTxs : allTxs);
  };
  apiService.updateRamp = async (request: UpdateRampRequest) => {
    calls.push({ method: "updateRamp", payload: request });
    return updated;
  };

  const context: VortexSdkContext = {
    storeEphemerals: async (...args) => {
      calls.push({ method: "storeEphemerals", payload: args });
      await options.storeEphemerals?.();
    }
  };
  const generateEphemerals = (async () => {
    calls.push({ method: "generateEphemerals", payload: undefined });
    return options.generateEphemerals ? options.generateEphemerals() : { accountMetas, ephemerals };
  }) as ConstructorParameters<typeof BrlHandler>[2];
  const signTransactions = async (...args: Parameters<ConstructorParameters<typeof BrlHandler>[3]>): Promise<PresignedTx[]> => {
    calls.push({ method: "signTransactions", payload: args });
    return options.signTransactions ? options.signTransactions() : args[0].map((tx, index) => ({ ...tx, txData: `presigned_${index}` }));
  };

  return { apiService, calls, handler: new Handler(apiService, context, generateEphemerals, signTransactions), updated };
}

const methods = (calls: Call[]) => calls.map(call => call.method);
const payload = (calls: Call[], method: string) => calls.find(call => call.method === method)?.payload;
const signerArgs = { evmEphemeral: ephemerals.EVM, substrateEphemeral: ephemerals.Substrate };

const presigned = (txs: UnsignedTx[]): PresignedTx[] => txs.map((tx, index) => ({ ...tx, txData: `presigned_${index}` }) as PresignedTx);

describe("BrlHandler", () => {
  test("onramp registers, stores ephemerals, signs every transaction and updates", async () => {
    const { calls, handler, updated } = setup(BrlHandler);

    const result = await handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION, taxId: "123" });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual([
      "getQuote",
      "getBrlRemainingLimit",
      "generateEphemerals",
      "registerRamp",
      "storeEphemerals",
      "signTransactions",
      "updateRamp"
    ]);
    expect(payload(calls, "getQuote")).toBe("quote_1");
    expect(payload(calls, "getBrlRemainingLimit")).toStrictEqual(["123", RampDirection.BUY]);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { destinationAddress: DESTINATION, taxId: "123" },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
    expect(payload(calls, "storeEphemerals")).toStrictEqual([ephemerals, "ramp_1"]);
    // BRL signs every transaction the backend returned, not only the ephemeral-owned ones.
    expect(payload(calls, "signTransactions")).toStrictEqual([allTxs, signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: {},
      presignedTxs: presigned(allTxs),
      rampId: "ramp_1"
    });
  });

  test("onramp without taxId sends none and skips the limit lookup filter", async () => {
    const { calls, handler } = setup(BrlHandler);

    await handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION });

    expect(payload(calls, "getBrlRemainingLimit")).toStrictEqual([undefined, RampDirection.BUY]);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { destinationAddress: DESTINATION, taxId: undefined },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
  });

  test("onramp signs an empty list when the backend returns no unsigned transactions", async () => {
    const { calls, handler } = setup(BrlHandler, { unsignedTxs: undefined });

    await handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION, taxId: "123" });

    expect(payload(calls, "signTransactions")).toStrictEqual([[], signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({ additionalData: {}, presignedTxs: [], rampId: "ramp_1" });
  });

  test("onramp rejects an amount above the remaining limit before generating ephemerals", async () => {
    const { calls, handler } = setup(BrlHandler, { remainingLimit: async () => ({ remainingLimit: 50 }) });

    await expect(handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION, taxId: "123" })).rejects.toBeInstanceOf(
      AmountExceedsLimitError
    );
    expect(methods(calls)).toEqual(["getQuote", "getBrlRemainingLimit"]);
  });

  test("a 404 from the limit lookup is permissive", async () => {
    const { calls, handler } = setup(BrlHandler, {
      remainingLimit: async () => {
        throw new VortexSdkError("Limits not found", 404, false);
      }
    });

    await handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION, taxId: "123" });

    expect(methods(calls)).toContain("updateRamp");
  });

  test("any other limit lookup failure propagates", async () => {
    const failure = new VortexSdkError("boom", 500, false);
    const { handler } = setup(BrlHandler, {
      remainingLimit: async () => {
        throw failure;
      }
    });

    await expect(handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION, taxId: "123" })).rejects.toBe(failure);
  });

  test("offramp validates the pix key and limit, then registers the full payload", async () => {
    const { calls, handler, updated } = setup(BrlHandler, { quote: { anchorFeeFiat: "5", inputAmount: "10", outputAmount: "95" } });

    const result = await handler.registerBrlOfframp("quote_1", {
      pixDestination: "pix@example.com",
      receiverTaxId: "999",
      taxId: "123",
      walletAddress: WALLET
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual([
      "validateBrlPixKey",
      "getQuote",
      "getBrlRemainingLimit",
      "generateEphemerals",
      "registerRamp",
      "storeEphemerals",
      "signTransactions",
      "updateRamp"
    ]);
    expect(payload(calls, "validateBrlPixKey")).toBe("pix@example.com");
    expect(payload(calls, "getBrlRemainingLimit")).toStrictEqual(["123", RampDirection.SELL]);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { pixDestination: "pix@example.com", receiverTaxId: "999", taxId: "123", walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
    expect(payload(calls, "storeEphemerals")).toStrictEqual([ephemerals, "ramp_1"]);
    expect(payload(calls, "signTransactions")).toStrictEqual([allTxs, signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: {},
      presignedTxs: presigned(allTxs),
      rampId: "ramp_1"
    });
  });

  test("offramp defaults the receiver tax id to the tax id and drops empty ones", async () => {
    const withTaxId = setup(BrlHandler);
    await withTaxId.handler.registerBrlOfframp("quote_1", { pixDestination: "pix", taxId: "123", walletAddress: WALLET });
    expect(payload(withTaxId.calls, "registerRamp")).toStrictEqual({
      additionalData: { pixDestination: "pix", receiverTaxId: "123", taxId: "123", walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });

    const withoutTaxId = setup(BrlHandler);
    await withoutTaxId.handler.registerBrlOfframp("quote_1", { pixDestination: "pix", walletAddress: WALLET });
    expect(payload(withoutTaxId.calls, "getBrlRemainingLimit")).toStrictEqual([undefined, RampDirection.SELL]);
    expect(payload(withoutTaxId.calls, "registerRamp")).toStrictEqual({
      additionalData: { pixDestination: "pix", receiverTaxId: undefined, taxId: undefined, walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
  });

  test("offramp treats an invalid or 4xx-rejected pix key as invalid before anything else runs", async () => {
    const invalid = setup(BrlHandler, { validatePixKey: async () => ({ valid: false }) });
    await expect(
      invalid.handler.registerBrlOfframp("quote_1", { pixDestination: "bad", taxId: "123", walletAddress: WALLET })
    ).rejects.toBeInstanceOf(InvalidPixKeyError);
    expect(methods(invalid.calls)).toEqual(["validateBrlPixKey"]);

    const rejected = setup(BrlHandler, {
      validatePixKey: async () => {
        throw new VortexSdkError("bad key", 400, false);
      }
    });
    await expect(
      rejected.handler.registerBrlOfframp("quote_1", { pixDestination: "bad", taxId: "123", walletAddress: WALLET })
    ).rejects.toBeInstanceOf(InvalidPixKeyError);
  });

  test("offramp lets a 5xx pix key failure propagate", async () => {
    const failure = new VortexSdkError("down", 503, false);
    const { handler } = setup(BrlHandler, {
      validatePixKey: async () => {
        throw failure;
      }
    });

    await expect(handler.registerBrlOfframp("quote_1", { pixDestination: "pix", walletAddress: WALLET })).rejects.toBe(failure);
  });

  test("offramp adds the anchor fee back to the net output when checking the limit", async () => {
    // net 95 + fee 5 = 100 > 99
    const { handler } = setup(BrlHandler, {
      quote: { anchorFeeFiat: "5", inputAmount: "10", outputAmount: "95" },
      remainingLimit: async () => ({ remainingLimit: 99 })
    });

    await expect(handler.registerBrlOfframp("quote_1", { pixDestination: "pix", walletAddress: WALLET })).rejects.toBeInstanceOf(
      AmountExceedsLimitError
    );
  });

  test("update forwards the hashes with no presigned transactions", async () => {
    const { calls, handler, updated } = setup(BrlHandler);

    const result = await handler.updateBrlOfframp("ramp_1", {
      assethubToPendulumHash: "0xH",
      squidRouterApproveHash: "0xA",
      squidRouterSwapHash: "0xS"
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual(["getRampStatus", "updateRamp"]);
    expect(payload(calls, "getRampStatus")).toBe("ramp_1");
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: { assethubToPendulumHash: "0xH", squidRouterApproveHash: "0xA", squidRouterSwapHash: "0xS" },
      presignedTxs: [],
      rampId: "ramp_1"
    });
  });

  test("update rejects a ramp that is past the initial phase", async () => {
    const { calls, handler } = setup(BrlHandler, { currentPhase: "fundEphemeral" });

    await expect(handler.updateBrlOfframp("ramp_1", {})).rejects.toThrow(
      "Invalid ramp id. Ramp must be on initial phase to be updated. Current phase: fundEphemeral"
    );
    expect(methods(calls)).toEqual(["getRampStatus"]);
  });
});

describe("DomesticHandler", () => {
  test("onramp signs only ephemeral-owned transactions", async () => {
    const { calls, handler, updated } = setup(DomesticHandler);

    const result = await handler.registerDomesticOnramp("quote_1", {
      destinationAddress: DESTINATION,
      fiatAccountId: "fa_1",
      sessionId: "session_1",
      walletAddress: WALLET
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual(["generateEphemerals", "registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { destinationAddress: DESTINATION, fiatAccountId: "fa_1", sessionId: "session_1", walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
    expect(payload(calls, "storeEphemerals")).toStrictEqual([ephemerals, "ramp_1"]);
    expect(payload(calls, "signTransactions")).toStrictEqual([[evmEphemeralTx, substrateEphemeralTx], signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: {},
      presignedTxs: presigned([evmEphemeralTx, substrateEphemeralTx]),
      rampId: "ramp_1"
    });
  });

  test("offramp signs only ephemeral-owned transactions", async () => {
    const { calls, handler, updated } = setup(DomesticHandler);

    const result = await handler.registerDomesticOfframp("quote_1", {
      fiatAccountId: "fa_1",
      sessionId: "session_1",
      walletAddress: WALLET
    });

    expect(result).toBe(updated);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { fiatAccountId: "fa_1", sessionId: "session_1", walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
    expect(payload(calls, "signTransactions")).toStrictEqual([[evmEphemeralTx, substrateEphemeralTx], signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: {},
      presignedTxs: presigned([evmEphemeralTx, substrateEphemeralTx]),
      rampId: "ramp_1"
    });
  });

  test("signs nothing when the backend returns no unsigned transactions", async () => {
    const { calls, handler } = setup(DomesticHandler, { unsignedTxs: undefined });

    await handler.registerDomesticOfframp("quote_1", { fiatAccountId: "fa_1", walletAddress: WALLET });

    expect(payload(calls, "signTransactions")).toStrictEqual([[], signerArgs]);
  });

  test("validates before generating ephemerals", async () => {
    const onramp = setup(DomesticHandler);
    await expect(onramp.handler.registerDomesticOnramp("quote_1", { destinationAddress: "" })).rejects.toBeInstanceOf(
      MissingDomesticOnrampParametersError
    );
    expect(onramp.calls).toEqual([]);

    const offramp = setup(DomesticHandler);
    await expect(offramp.handler.registerDomesticOfframp("quote_1", { fiatAccountId: "", walletAddress: WALLET })).rejects.toBeInstanceOf(
      MissingDomesticOfframpParametersError
    );
    expect(offramp.calls).toEqual([]);
  });

  test("update forwards the hashes with no presigned transactions", async () => {
    const { calls, handler, updated } = setup(DomesticHandler);

    const result = await handler.updateDomesticOfframp("ramp_1", {
      assethubToPendulumHash: "0xH",
      squidRouterApproveHash: "0xA",
      squidRouterSwapHash: "0xS"
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual(["getRampStatus", "updateRamp"]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: { assethubToPendulumHash: "0xH", squidRouterApproveHash: "0xA", squidRouterSwapHash: "0xS" },
      presignedTxs: [],
      rampId: "ramp_1"
    });
  });

  test("update rejects a ramp that is past the initial phase with its own message", async () => {
    const { calls, handler } = setup(DomesticHandler, { currentPhase: "fundEphemeral" });

    await expect(handler.updateDomesticOfframp("ramp_1", {})).rejects.toThrow(
      "Ramp cannot be updated in its current phase. Expected initial phase, got: fundEphemeral"
    );
    expect(methods(calls)).toEqual(["getRampStatus"]);
  });
});

describe("EurHandler", () => {
  test("onramp signs only ephemeral-owned transactions", async () => {
    const { calls, handler, updated } = setup(EurHandler);

    const result = await handler.registerEurOnramp("quote_1", {
      customerType: "business",
      destinationAddress: DESTINATION,
      walletAddress: WALLET
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual(["generateEphemerals", "registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { customerType: "business", destinationAddress: DESTINATION, walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
    expect(payload(calls, "storeEphemerals")).toStrictEqual([ephemerals, "ramp_1"]);
    expect(payload(calls, "signTransactions")).toStrictEqual([[evmEphemeralTx, substrateEphemeralTx], signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: {},
      presignedTxs: presigned([evmEphemeralTx, substrateEphemeralTx]),
      rampId: "ramp_1"
    });
  });

  test("onramp omits customerType when none is given", async () => {
    const { calls, handler } = setup(EurHandler);

    await handler.registerEurOnramp("quote_1", { destinationAddress: DESTINATION, walletAddress: WALLET });

    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: { destinationAddress: DESTINATION, walletAddress: WALLET },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
  });

  test("offramp registers the Mykobo payload and signs only ephemeral-owned transactions", async () => {
    const { calls, handler, updated } = setup(EurHandler);

    const result = await handler.registerEurOfframp("quote_1", {
      destinationAddress: "DE00IBAN",
      email: "user@example.com",
      ipAddress: "203.0.113.1",
      walletAddress: WALLET
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual(["generateEphemerals", "registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);
    expect(payload(calls, "registerRamp")).toStrictEqual({
      additionalData: {
        destinationAddress: "DE00IBAN",
        email: "user@example.com",
        ipAddress: "203.0.113.1",
        walletAddress: WALLET
      },
      quoteId: "quote_1",
      signingAccounts: accountMetas
    });
    expect(payload(calls, "signTransactions")).toStrictEqual([[evmEphemeralTx, substrateEphemeralTx], signerArgs]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: {},
      presignedTxs: presigned([evmEphemeralTx, substrateEphemeralTx]),
      rampId: "ramp_1"
    });
  });

  test("validates before generating ephemerals", async () => {
    const onramp = setup(EurHandler);
    await expect(onramp.handler.registerEurOnramp("quote_1", { destinationAddress: DESTINATION, walletAddress: "" })).rejects.toBeInstanceOf(
      MissingEurOnrampParametersError
    );
    expect(onramp.calls).toEqual([]);

    const offramp = setup(EurHandler);
    await expect(
      offramp.handler.registerEurOfframp("quote_1", { destinationAddress: "DE00", email: "", ipAddress: "1.1.1.1", walletAddress: WALLET })
    ).rejects.toBeInstanceOf(MissingMykoboOfframpParametersError);
    expect(offramp.calls).toEqual([]);
  });

  test("update forwards the hashes with no presigned transactions", async () => {
    const { calls, handler, updated } = setup(EurHandler);

    const result = await handler.updateEurOfframp("ramp_1", {
      assethubToPendulumHash: "0xH",
      squidRouterApproveHash: "0xA",
      squidRouterSwapHash: "0xS"
    });

    expect(result).toBe(updated);
    expect(methods(calls)).toEqual(["getRampStatus", "updateRamp"]);
    expect(payload(calls, "updateRamp")).toStrictEqual({
      additionalData: { assethubToPendulumHash: "0xH", squidRouterApproveHash: "0xA", squidRouterSwapHash: "0xS" },
      presignedTxs: [],
      rampId: "ramp_1"
    });
  });

  test("update rejects a ramp that is past the initial phase", async () => {
    const { handler } = setup(EurHandler, { currentPhase: "fundEphemeral" });

    await expect(handler.updateEurOfframp("ramp_1", {})).rejects.toThrow(
      "Invalid ramp id. Ramp must be on initial phase to be updated. Current phase: fundEphemeral"
    );
  });
});

describe("registration failure ordering", () => {
  type Scenario = { name: string; start: (options: SetupOptions, mutate?: (api: ApiService) => void) => { calls: Call[]; result: Promise<unknown> } };

  const scenarios: Scenario[] = [
    {
      name: "BRL onramp",
      start: (options, mutate) => {
        const { apiService, calls, handler } = setup(BrlHandler, options);
        mutate?.(apiService);
        return { calls, result: handler.registerBrlOnramp("quote_1", { destinationAddress: DESTINATION, taxId: "1" }) };
      }
    },
    {
      name: "BRL offramp",
      start: (options, mutate) => {
        const { apiService, calls, handler } = setup(BrlHandler, options);
        mutate?.(apiService);
        return { calls, result: handler.registerBrlOfframp("quote_1", { pixDestination: "pix", taxId: "1", walletAddress: WALLET }) };
      }
    },
    {
      name: "Domestic onramp",
      start: (options, mutate) => {
        const { apiService, calls, handler } = setup(DomesticHandler, options);
        mutate?.(apiService);
        return { calls, result: handler.registerDomesticOnramp("quote_1", { destinationAddress: DESTINATION }) };
      }
    },
    {
      name: "Domestic offramp",
      start: (options, mutate) => {
        const { apiService, calls, handler } = setup(DomesticHandler, options);
        mutate?.(apiService);
        return { calls, result: handler.registerDomesticOfframp("quote_1", { fiatAccountId: "fa", walletAddress: WALLET }) };
      }
    },
    {
      name: "EUR onramp",
      start: (options, mutate) => {
        const { apiService, calls, handler } = setup(EurHandler, options);
        mutate?.(apiService);
        return { calls, result: handler.registerEurOnramp("quote_1", { destinationAddress: DESTINATION, walletAddress: WALLET }) };
      }
    },
    {
      name: "EUR offramp",
      start: (options, mutate) => {
        const { apiService, calls, handler } = setup(EurHandler, options);
        mutate?.(apiService);
        return {
          calls,
          result: handler.registerEurOfframp("quote_1", {
            destinationAddress: "DE00",
            email: "a@b.c",
            ipAddress: "1.1.1.1",
            walletAddress: WALLET
          })
        };
      }
    }
  ];

  for (const { name, start } of scenarios) {
    test(`${name} fails closed when persisting the ephemerals fails: nothing is signed or updated`, async () => {
      const failure = new Error("disk full");
      const { calls, result } = start({
        storeEphemerals: async () => {
          throw failure;
        }
      });

      await expect(result).rejects.toBe(failure);
      expect(methods(calls)).not.toContain("signTransactions");
      expect(methods(calls)).not.toContain("updateRamp");
    });

    test(`${name} does not update the ramp when signing fails`, async () => {
      const failure = new Error("signing failed");
      const { calls, result } = start({
        signTransactions: async () => {
          throw failure;
        }
      });

      await expect(result).rejects.toBe(failure);
      expect(methods(calls)).toContain("storeEphemerals");
      expect(methods(calls)).not.toContain("updateRamp");
    });

    test(`${name} stores nothing when registration fails`, async () => {
      const failure = new Error("register failed");
      const { calls, result } = start({}, api => {
        api.registerRamp = async () => {
          throw failure;
        };
      });

      await expect(result).rejects.toBe(failure);
      expect(methods(calls)).not.toContain("storeEphemerals");
      expect(methods(calls)).not.toContain("signTransactions");
    });
  }
});
