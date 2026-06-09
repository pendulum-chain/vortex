import { afterEach, describe, expect, it, mock } from "bun:test";
import ApiClientEvent from "../../models/apiClientEvent.model";
import {
  buildApiClientRequestMetadata,
  getSafeApiKeyPrefix,
  recordApiClientEventSafe,
  sanitizeApiClientEvent
} from "./apiClientEvent.service";

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

  it("keeps sanitized request summaries while stripping raw request details", () => {
    const sanitized = sanitizeApiClientEvent({
      errorType: "validation_error",
      metadata: {
        authorization: "Bearer token",
        requestBodyInputAmount: "100\n200",
        requestBodyNetworksCount: 2,
        requestMethod: "POST",
        rawBody: { inputAmount: "100" }
      },
      operation: "quote_create_best",
      status: "failure"
    });

    expect(sanitized.metadata).toEqual({
      requestBodyInputAmount: "100 200",
      requestBodyNetworksCount: 2,
      requestMethod: "POST"
    });
  });

  it("defaults successful events to the none error type", () => {
    const sanitized = sanitizeApiClientEvent({ operation: "quote_get", status: "success" });

    expect(sanitized.errorType).toBe("none");
    expect(sanitized.errorMessage).toBeNull();
  });

  it("uses a distinct safe message for missing partner records", () => {
    const sanitized = sanitizeApiClientEvent({
      errorMessage: "Partner 123e4567-e89b-12d3-a456-426614174000 was not found",
      errorType: "auth_partner_not_found",
      operation: "auth_api_key",
      status: "failure"
    });

    expect(sanitized.errorType).toBe("auth_partner_not_found");
    expect(sanitized.errorMessage).toBe("Requested partner was not found.");
    expect(sanitized.errorMessage).not.toContain("123e4567-e89b-12d3-a456-426614174000");
  });
});

describe("buildApiClientRequestMetadata", () => {
  it("builds a scalar request summary from allowlisted request fields", () => {
    const metadata = buildApiClientRequestMetadata(
      {
        body: {
          additionalData: { taxId: "12345678900" },
          apiKey: "pk_live_secret",
          inputAmount: "100",
          networks: ["Polygon", "Base"]
        },
        method: "POST",
        params: { id: "ramp-1" },
        path: "/v1/quotes/best",
        query: { showUnsignedTxs: "true" }
      },
      { bodyKeys: ["apiKey", "inputAmount", "networks", "additionalData"], paramKeys: ["id"], queryKeys: ["showUnsignedTxs"] }
    );

    expect(metadata).toEqual({
      hasRequestBodyAdditionalData: true,
      requestBodyInputAmount: "100",
      requestBodyNetworksCount: 2,
      requestMethod: "POST",
      requestParamId: "ramp-1",
      requestPath: "/v1/quotes/best",
      requestQueryShowUnsignedTxs: "true"
    });
  });

  it("templates route param values out of request paths", () => {
    const metadata = buildApiClientRequestMetadata(
      {
        method: "GET",
        params: { walletAddress: "0xabc123" },
        path: "/v1/ramp/history/0xabc123"
      },
      { paramKeys: [] }
    );

    expect(metadata).toEqual({
      requestMethod: "GET",
      requestPath: "/v1/ramp/history/:walletAddress"
    });
  });

  it("records only counts or presence flags for allowlisted sensitive payload fields", () => {
    const metadata = buildApiClientRequestMetadata(
      {
        body: {
          additionalData: { receiverTaxId: "12345678900" },
          presignedTxs: ["signed-payload"],
          signingAccounts: ["wallet-address-1", "wallet-address-2"],
          taxId: "12345678900"
        },
        method: "POST",
        path: "/v1/ramp/register"
      },
      { bodyKeys: ["additionalData", "presignedTxs", "signingAccounts", "taxId"] }
    );

    expect(metadata).toEqual({
      hasRequestBodyAdditionalData: true,
      requestBodyPresignedTxsCount: 1,
      requestBodySigningAccountsCount: 2,
      requestMethod: "POST",
      requestPath: "/v1/ramp/register"
    });
  });
});

describe("getSafeApiKeyPrefix", () => {
  it("keeps enough key-specific characters to identify an API key", () => {
    expect(getSafeApiKeyPrefix("pk_live_1234567890abcdef")).toBe("pk_live_12345678");
    expect(getSafeApiKeyPrefix("sk_live_abcdef1234567890", ["sk_"])).toBe("sk_live_abcdef12");
  });

  it("rejects disallowed key types", () => {
    expect(getSafeApiKeyPrefix("sk_live_abcdef1234567890", ["pk_"])).toBeNull();
    expect(getSafeApiKeyPrefix("not-a-key")).toBeNull();
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
