import { describe, expect, it } from "bun:test";
import { Networks } from "../../helpers";
import { EvmClientManager, redactRpcUrlForLogs, sanitizeRpcErrorMessage } from "./clientManager";

describe("redactRpcUrlForLogs", () => {
  it("redacts provider API keys from RPC URLs", () => {
    expect(redactRpcUrlForLogs("https://polygon-mainnet.g.alchemy.com/v2/test-api-key")).toBe(
      "https://polygon-mainnet.g.alchemy.com/v2/[redacted]"
    );
  });

  it("leaves empty viem default RPC markers readable", () => {
    expect(redactRpcUrlForLogs("")).toBe("<default>");
  });

  it("redacts provider API keys embedded in RPC error messages", () => {
    expect(
      sanitizeRpcErrorMessage(
        "URL: https://polygon-mainnet.g.alchemy.com/v2/test-api-key\nRequest failed"
      )
    ).toBe("URL: https://polygon-mainnet.g.alchemy.com/v2/[redacted]\nRequest failed");
  });
});

describe("EvmClientManager RPC cache keys", () => {
  it("keeps the viem default transport distinct from explicit RPC URLs", () => {
    const manager = EvmClientManager.getInstance() as unknown as {
      generatePublicClientKey: (networkName: Networks, rpcUrl: string) => string;
    };

    expect(manager.generatePublicClientKey(Networks.Polygon, "")).toBe(`${Networks.Polygon}-<default>`);
    expect(manager.generatePublicClientKey(Networks.Polygon, "")).not.toBe(
      manager.generatePublicClientKey(Networks.Polygon, "https://polygon-mainnet.g.alchemy.com/v2/test-api-key")
    );
  });
});
