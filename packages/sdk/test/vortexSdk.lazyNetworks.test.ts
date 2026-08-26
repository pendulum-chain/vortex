import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  EPaymentMethod,
  EvmClientManager,
  EphemeralAccountType,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  type QuoteResponse,
  type RegisterRampRequest,
  type UnsignedTx,
} from "@vortexfi/shared";
import {
  InsufficientBalanceError,
  NetworkApiInitializationError,
  TransactionSigningError,
} from "../src/errors";
import type { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

const originalFetch = globalThis.fetch;
const DEAD_WEBSOCKET_URL = "ws://127.0.0.1:1";

const quote: QuoteResponse = {
  anchorFeeFiat: "0",
  anchorFeeUsd: "0",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2026-01-01T00:10:00.000Z"),
  feeCurrency: FiatToken.BRL,
  from: EPaymentMethod.PIX,
  id: "quote_1",
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  networkFeeFiat: "0",
  networkFeeUsd: "0",
  outputAmount: "20",
  outputCurrency: EvmToken.USDC,
  partnerFeeFiat: "0",
  partnerFeeUsd: "0",
  paymentMethod: EPaymentMethod.PIX,
  processingFeeFiat: "0",
  processingFeeUsd: "0",
  rampType: RampDirection.BUY,
  to: Networks.Base,
  totalFeeFiat: "0",
  totalFeeUsd: "0",
  vortexFeeFiat: "0",
  vortexFeeUsd: "0",
};

const offrampQuote: QuoteResponse = {
  ...quote,
  from: Networks.AssetHub,
  inputCurrency: EvmToken.USDC,
  network: Networks.AssetHub,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX,
};

const evmOfframpQuote: QuoteResponse = {
  ...offrampQuote,
  from: Networks.Polygon,
  network: Networks.Polygon,
};

function rampProcess(
  unsignedTxs: UnsignedTx[] = [],
  quoteResponse: QuoteResponse = quote
) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    currentPhase: "initial",
    from: quoteResponse.from,
    id: "ramp_1",
    inputAmount: "100",
    inputCurrency: quoteResponse.inputCurrency,
    network: quoteResponse.network,
    outputAmount: "20",
    outputCurrency: quoteResponse.outputCurrency,
    paymentMethod: EPaymentMethod.PIX,
    quoteId: quoteResponse.id,
    to: quoteResponse.to,
    type: quoteResponse.rampType,
    unsignedTxs,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function mockBackend(
  requiredSigningNetwork?: Networks.Pendulum,
  quoteResponse: QuoteResponse = quote
) {
  const calls: string[] = [];

  globalThis.fetch = mock(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL
          ? input.toString()
          : input.url
      );
      const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      calls.push(`${method} ${url.pathname}`);

      if (method === "POST" && url.pathname === "/v1/quotes") {
        return Response.json(quoteResponse);
      }

      if (
        method === "GET" &&
        url.pathname === `/v1/quotes/${quoteResponse.id}`
      ) {
        return Response.json(quoteResponse);
      }

      if (
        method === "GET" &&
        url.pathname === "/v1/brla/getUserRemainingLimit"
      ) {
        return Response.json({ remainingLimit: 1_000 });
      }

      if (method === "GET" && url.pathname === "/v1/brla/validatePixKey") {
        return Response.json({ valid: true });
      }

      if (method === "POST" && url.pathname === "/v1/ramp/register") {
        const request = JSON.parse(String(init?.body)) as RegisterRampRequest;
        const unsignedTxs: UnsignedTx[] = [];

        if (requiredSigningNetwork === Networks.Pendulum) {
          const substrateSigner = request.signingAccounts.find(
            (account) => account.type === EphemeralAccountType.Substrate
          );
          if (!substrateSigner) {
            throw new Error("Expected a Substrate signing account");
          }
          unsignedTxs.push({
            meta: {},
            network: Networks.Pendulum,
            nonce: 0,
            phase: "fundEphemeral",
            signer: substrateSigner.address,
            txData: "0x00",
          });
        }

        return Response.json(rampProcess(unsignedTxs, quoteResponse));
      }

      if (method === "POST" && url.pathname === "/v1/ramp/update") {
        return Response.json(rampProcess([], quoteResponse));
      }

      throw new Error(`Unexpected backend request: ${method} ${url.pathname}`);
    }
  ) as typeof fetch;

  return calls;
}

async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs = 2_000
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Test operation exceeded ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createSdk(
  networkInitializationTimeoutMs = 50,
  offrampFundingMode?: VortexSdkConfig["offrampFundingMode"]
): VortexSdk {
  return new VortexSdk({
    apiBaseUrl: "https://backend.test",
    hydrationWsUrl: DEAD_WEBSOCKET_URL,
    moonbeamWsUrl: DEAD_WEBSOCKET_URL,
    networkInitializationTimeoutMs,
    offrampFundingMode,
    pendulumWsUrl: DEAD_WEBSOCKET_URL,
    secretKey: "sk_test_user",
    storeEphemeralKeys: false,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("lazy chain WebSocket initialization", () => {
  test("registration requires a secret key or access token provider", async () => {
    const sdk = new VortexSdk({ apiBaseUrl: "https://backend.test", storeEphemeralKeys: false });

    await expect(sdk.registerRamp(quote, { destinationAddress: "0xuser" })).rejects.toThrow(
      "Ramp registration requires a secretKey (sk_*) or accessTokenProvider"
    );
  });

  test("registration accepts an access token provider", async () => {
    const calls = mockBackend();
    const sdk = new VortexSdk({
      accessTokenProvider: async () => "access-token",
      apiBaseUrl: "https://backend.test",
      storeEphemeralKeys: false,
    });

    const createdQuote = await sdk.createQuote({
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Base,
    });
    const result = await sdk.registerRamp(createdQuote, { destinationAddress: "0xuser" });

    expect(result.rampProcess.id).toBe("ramp_1");
    expect(calls).toContain("POST /v1/ramp/register");
  });

  test("BRL quote and registration reach the backend when no signing transactions are returned", async () => {
    const calls = mockBackend();
    const sdk = createSdk();

    const createdQuote = await withDeadline(
      sdk.createQuote({
        from: EPaymentMethod.PIX,
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Base,
      })
    );
    const result = await withDeadline(
      sdk.registerRamp(createdQuote, { destinationAddress: "0xuser" })
    );

    expect(result.rampProcess.id).toBe("ramp_1");
    expect(calls).toContain("POST /v1/quotes");
    expect(calls).toContain("POST /v1/ramp/register");
    expect(calls).toContain("POST /v1/ramp/update");
  });

  test("registration awaits custom ephemeral storage and fails before signing or update", async () => {
    const calls = mockBackend(Networks.Pendulum);
    let rejectStorage!: (reason?: unknown) => void;
    let storageStarted!: () => void;
    const storageStart = new Promise<void>(resolve => {
      storageStarted = resolve;
    });
    const storageResult = new Promise<void>((_, reject) => {
      rejectStorage = reject;
    });
    const sdk = new VortexSdk({
      apiBaseUrl: "https://backend.test",
      networkInitializationTimeoutMs: 40,
      pendulumWsUrl: DEAD_WEBSOCKET_URL,
      secretKey: "sk_test_user",
      storeEphemeralKeysCallback: async () => {
        storageStarted();
        await storageResult;
      },
    });

    const registration = sdk.registerRamp(quote, { destinationAddress: "0xuser" });
    let registrationSettled = false;
    void registration.then(
      () => {
        registrationSettled = true;
      },
      () => {
        registrationSettled = true;
      }
    );

    await withDeadline(storageStart);
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(registrationSettled).toBe(false);
    expect(calls).toContain("POST /v1/ramp/register");
    expect(calls).not.toContain("POST /v1/ramp/update");

    rejectStorage(new Error("vault unavailable"));

    await expect(withDeadline(registration)).rejects.toThrow("vault unavailable");
    expect(calls).not.toContain("POST /v1/ramp/update");
  });

  test("BRL offramp registration also bypasses unavailable chain WebSockets", async () => {
    const calls = mockBackend(undefined, offrampQuote);
    const sdk = createSdk();

    const result = await withDeadline(
      sdk.registerRamp(offrampQuote, {
        pixDestination: "user@example.com",
        walletAddress: "0x1234567890123456789012345678901234567890",
      })
    );

    expect(result.rampProcess.id).toBe("ramp_1");
    expect(calls).toContain("GET /v1/brla/validatePixKey");
    expect(calls).toContain("POST /v1/ramp/register");
    expect(calls).toContain("POST /v1/ramp/update");
  });

  test("EVM offramp registration checks the source balance by default", async () => {
    const calls = mockBackend(undefined, evmOfframpQuote);
    const sdk = createSdk();
    const clientManager = EvmClientManager.getInstance();
    const originalReadContract = clientManager.readContractWithRetry;
    const readContract = mock(async () => 0n);
    clientManager.readContractWithRetry = readContract as typeof clientManager.readContractWithRetry;

    try {
      await expect(
        sdk.registerRamp(evmOfframpQuote, {
          pixDestination: "user@example.com",
          walletAddress: "0x1234567890123456789012345678901234567890",
        })
      ).rejects.toBeInstanceOf(InsufficientBalanceError);
    } finally {
      clientManager.readContractWithRetry = originalReadContract;
    }

    expect(readContract).toHaveBeenCalled();
    expect(calls).not.toContain("POST /v1/ramp/register");
  });

  test("deferred funding allows EVM offramp registration before the wallet is funded", async () => {
    const calls = mockBackend(undefined, evmOfframpQuote);
    const sdk = createSdk(50, "deferred");
    const clientManager = EvmClientManager.getInstance();
    const originalReadContract = clientManager.readContractWithRetry;
    const readContract = mock(async () => 0n);
    clientManager.readContractWithRetry = readContract as typeof clientManager.readContractWithRetry;

    try {
      const result = await sdk.registerRamp(evmOfframpQuote, {
        pixDestination: "user@example.com",
        walletAddress: "0x1234567890123456789012345678901234567890",
      });

      expect(result.rampProcess.id).toBe("ramp_1");
    } finally {
      clientManager.readContractWithRetry = originalReadContract;
    }

    expect(readContract).not.toHaveBeenCalled();
    expect(calls).toContain("POST /v1/ramp/register");
  });

  test("a required Pendulum signing API fails with a named, bounded timeout", async () => {
    const calls = mockBackend(Networks.Pendulum);
    const sdk = createSdk(40);

    let thrown: unknown;
    try {
      await withDeadline(
        sdk.registerRamp(quote, { destinationAddress: "0xuser" })
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TransactionSigningError);
    expect((thrown as Error).message).toContain("Pendulum WebSocket API");
    expect((thrown as Error).message).toContain("40ms");
    expect((thrown as TransactionSigningError).originalError).toBeInstanceOf(
      NetworkApiInitializationError
    );
    expect((thrown as TransactionSigningError).originalError).toMatchObject({
      network: Networks.Pendulum,
      timeoutMs: 40,
    });
    expect(calls).toContain("POST /v1/ramp/register");
    expect(calls).not.toContain("POST /v1/ramp/update");
  });
});
