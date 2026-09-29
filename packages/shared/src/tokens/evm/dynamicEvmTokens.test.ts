import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { Networks } from "../../helpers/networks";
import { EvmToken } from "../types/evm";
import { evmTokenConfig } from "./config";

type DynamicEvmTokens = typeof import("./dynamicEvmTokens");

const PAXG_ADDRESS = "0x45804880de22913dafe09f4980848ece6ecbaf78";
const staticUsdc = evmTokenConfig[Networks.Ethereum][EvmToken.USDC]!;

const squidToken = (symbol: string, address: string, decimals: number, usdPrice: number) => ({
  address,
  chainId: "1",
  decimals,
  logoURI: "",
  symbol,
  usdPrice
});

const squidTokenList = {
  tokens: [
    squidToken("PAXG", PAXG_ADDRESS, 18, 3300),
    squidToken(staticUsdc.assetSymbol, staticUsdc.erc20AddressSourceChain, 6, 1)
  ]
};

const okResponse = () => new Response(JSON.stringify(squidTokenList));

// The service keeps its state at module level; a query string makes Bun evaluate a private copy per test.
let freshImports = 0;
let tokens: DynamicEvmTokens;

const realFetch = globalThis.fetch;
let fetchCalls: number;
const stubFetch = (handler: (init: RequestInit) => Promise<Response>) => {
  globalThis.fetch = (async (_url: unknown, init: RequestInit = {}) => {
    fetchCalls++;
    return handler(init);
  }) as unknown as typeof fetch;
};

const ethereumSymbols = () => tokens.getEvmTokensForNetwork(Networks.Ethereum).map(token => token.assetSymbol);

let consoleError: ReturnType<typeof spyOn>;

beforeEach(async () => {
  fetchCalls = 0;
  consoleError = spyOn(console, "error").mockImplementation(() => {});
  tokens = (await import(`./dynamicEvmTokens.ts?fresh=${++freshImports}`)) as DynamicEvmTokens;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  consoleError.mockRestore();
});

describe("initializeEvmTokens", () => {
  test("a failed fetch falls back to the static tokens and reports that Squid is not loaded", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));

    expect(await tokens.initializeEvmTokens()).toBe(false);

    // The fallback still unblocks subscribers and keeps the static tokens quotable; only Squid-only tokens are missing.
    expect(tokens.getEvmTokensLoadedSnapshot()).toBe(true);
    expect(ethereumSymbols()).toContain(staticUsdc.assetSymbol);
    expect(ethereumSymbols()).not.toContain("PAXG");
  });

  test("a non-OK response counts as a failed fetch", async () => {
    stubFetch(async () => new Response("bad gateway", { status: 502 }));

    expect(await tokens.initializeEvmTokens()).toBe(false);
    expect(ethereumSymbols()).not.toContain("PAXG");
  });

  test("a later call retries after a failure and loads the Squid-only tokens", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    expect(await tokens.initializeEvmTokens()).toBe(false);

    let notifications = 0;
    tokens.subscribeEvmTokensLoaded(() => notifications++);
    stubFetch(async () => okResponse());

    expect(await tokens.initializeEvmTokens()).toBe(true);

    const paxg = tokens.getEvmTokenConfig()[Networks.Ethereum].PAXG;
    expect(paxg?.decimals).toBe(18);
    expect(paxg?.erc20AddressSourceChain).toBe(PAXG_ADDRESS);
    expect(tokens.getTokenUsdPrice("PAXG")).toBe(3300);
    expect(tokens.getEvmTokenConfig()[Networks.Ethereum][EvmToken.USDC]?.erc20AddressSourceChain).toBe(
      staticUsdc.erc20AddressSourceChain
    );
    expect(notifications).toBeGreaterThan(0);
  });

  test("does not fetch again once the Squid list is loaded", async () => {
    stubFetch(async () => okResponse());
    expect(await tokens.initializeEvmTokens()).toBe(true);
    expect(fetchCalls).toBe(1);

    expect(await tokens.initializeEvmTokens()).toBe(true);
    expect(fetchCalls).toBe(1);
  });

  test("aborts a hung fetch after the timeout instead of stalling", async () => {
    // Keep the production timeout value observable, but let the test abort after 20 ms.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20));
    stubFetch(
      init =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })
    );

    try {
      expect(await tokens.initializeEvmTokens()).toBe(false);
      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      expect(ethereumSymbols()).toContain(staticUsdc.assetSymbol);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
