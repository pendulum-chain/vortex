import {describe, expect, it} from "bun:test";
import {Networks} from "../../helpers";
import {EvmClientManager, getEvmNetworks, redactRpcUrlForLogs, sanitizeRpcErrorMessage} from "./clientManager";

describe("redactRpcUrlForLogs", () => {
  it("redacts provider API keys from RPC URLs", () => {
    expect(redactRpcUrlForLogs("https://polygon-mainnet.g.alchemy.com/v2/test-api-key")).toBe(
      "https://polygon-mainnet.g.alchemy.com/v2/[redacted]"
    );
    expect(redactRpcUrlForLogs("https://polygon-amoy.g.alchemy.com/v2/test-api-key")).toBe(
      "https://polygon-amoy.g.alchemy.com/v2/[redacted]"
    );
  });

  it("leaves empty viem default RPC markers readable", () => {
    expect(redactRpcUrlForLogs("")).toBe("<default>");
  });

  it("redacts provider API keys embedded in RPC error messages", () => {
    expect(
      sanitizeRpcErrorMessage("URL: https://polygon-mainnet.g.alchemy.com/v2/test-api-key\nRequest failed")
    ).toBe("URL: https://polygon-mainnet.g.alchemy.com/v2/[redacted]\nRequest failed");
  });
});

describe("EvmClientManager RPC cache keys", () => {
  it("uses Alchemy first and viem's default transport as the Polygon Amoy fallback", () => {
    const apiKey = "test-api-key";
    const polygonAmoyConfig = getEvmNetworks(apiKey).find(network => network.name === Networks.PolygonAmoy);

    expect(polygonAmoyConfig?.rpcUrls).toEqual([`https://polygon-amoy.g.alchemy.com/v2/${apiKey}`, ""]);
  });

  it("uses only viem's default Polygon Amoy transport without an Alchemy API key", () => {
    const polygonAmoyConfig = getEvmNetworks().find(network => network.name === Networks.PolygonAmoy);

    expect(polygonAmoyConfig?.rpcUrls).toEqual([""]);
  });
});

describe("EvmClientManager read contract retries", () => {
  it("does not retry deterministic Nabla coverage-ratio reverts", async () => {
    const manager = EvmClientManager.getInstance();
    const managerWithMockedClient = manager as EvmClientManager & { getClient: EvmClientManager["getClient"] };
    const originalGetClient = managerWithMockedClient.getClient;
    let attempts = 0;

    managerWithMockedClient.getClient = (() =>
      ({
        readContract: async () => {
          attempts += 1;
          throw new Error("execution reverted: SP:quoteSwapInto:EXCEEDS_MAX_COVERAGE_RATIO");
        }
      }) as unknown as ReturnType<EvmClientManager["getClient"]>) as EvmClientManager["getClient"];

    try {
      await expect(
        manager.readContractWithRetry(
          Networks.Base,
          {
            abi: [],
            address: "0x2A7989993335b31A3133CDA93bc1a095e7b178Ff",
            functionName: "quoteSwapExactTokensForTokens"
          },
          3,
          0
        )
      ).rejects.toThrow("EXCEEDS_MAX_COVERAGE_RATIO");
      expect(attempts).toBe(1);
    } finally {
      managerWithMockedClient.getClient = originalGetClient;
    }
  });
});
