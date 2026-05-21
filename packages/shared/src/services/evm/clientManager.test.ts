import { describe, expect, it } from "bun:test";
import { redactRpcUrlForLogs, sanitizeRpcErrorMessage } from "./clientManager";

describe("redactRpcUrlForLogs", () => {
  it("redacts provider API keys from RPC URLs", () => {
    expect(redactRpcUrlForLogs("https://polygon-mainnet.g.alchemy.com/v2/dUzb7oLgJ3f9T72vWR-Iw7X38wct7h62")).toBe(
      "https://polygon-mainnet.g.alchemy.com/v2/[redacted]"
    );
  });

  it("leaves empty viem default RPC markers readable", () => {
    expect(redactRpcUrlForLogs("")).toBe("<default>");
  });

  it("redacts provider API keys embedded in RPC error messages", () => {
    expect(
      sanitizeRpcErrorMessage(
        "URL: https://polygon-mainnet.g.alchemy.com/v2/dUzb7oLgJ3f9T72vWR-Iw7X38wct7h62\nRequest failed"
      )
    ).toBe("URL: https://polygon-mainnet.g.alchemy.com/v2/[redacted]\nRequest failed");
  });
});
