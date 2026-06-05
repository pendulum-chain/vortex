import { afterEach, describe, expect, it, mock } from "bun:test";
import ApiClientEvent from "../../models/apiClientEvent.model";
import { recordApiClientEventSafe, sanitizeApiClientEvent } from "./apiClientEvent.service";

describe("sanitizeApiClientEvent", () => {
  it("removes sensitive metadata and replaces raw error messages", () => {
    const sanitized = sanitizeApiClientEvent({
      apiKeyPrefix: "pk_live_1234567890",
      errorMessage: "Invalid EVM address format: 0x1234567890abcdef with taxId 12345678900",
      errorType: "invalid_ephemerals",
      metadata: {
        apiKey: "pk_live_secret",
        endpoint: "/v1/ramp/start",
        nested: { unsafe: true },
        taxId: "12345678900"
      },
      operation: "ramp_start",
      partnerName: "p".repeat(150),
      status: "failure"
    });

    expect(sanitized.apiKeyPrefix).toHaveLength(16);
    expect(sanitized.errorMessage).toBe("Ephemeral account validation failed.");
    expect(sanitized.errorMessage).not.toContain("0x1234567890abcdef");
    expect(sanitized.errorMessage).not.toContain("12345678900");
    expect(sanitized.errorType).toBe("invalid_ephemerals");
    expect(sanitized.metadata).toEqual({ endpoint: "/v1/ramp/start" });
    expect(sanitized.partnerName).toHaveLength(100);
  });

  it("defaults successful events to the none error type", () => {
    const sanitized = sanitizeApiClientEvent({ operation: "quote_get", status: "success" });

    expect(sanitized.errorType).toBe("none");
    expect(sanitized.errorMessage).toBeNull();
  });
});

describe("recordApiClientEventSafe", () => {
  const originalCreate = ApiClientEvent.create;

  afterEach(() => {
    ApiClientEvent.create = originalCreate;
  });

  it("swallows persistence failures", async () => {
    ApiClientEvent.create = mock(async () => {
      throw new Error("database unavailable");
    }) as typeof ApiClientEvent.create;

    await expect(recordApiClientEventSafe({ operation: "quote_create", status: "failure" })).resolves.toBeUndefined();
  });
});
