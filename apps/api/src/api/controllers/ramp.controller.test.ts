import { AlfredpayApiError, BrlaApiError } from "@vortexfi/shared";
import { describe, expect, it } from "bun:test";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import { classifyApiClientError } from "../observability/errorClassifier";
import { formatProviderContext, mapProviderFailure } from "./ramp.controller";

describe("mapProviderFailure", () => {
  it("maps a 4xx Avenia rejection (e.g. blocked user) to a 422 with a sanitized public message", () => {
    const providerError = new BrlaApiError({
      endpoint: "/v2/account/tickets",
      method: "POST",
      responseBody: JSON.stringify({ error: "user is blocked" }),
      status: 400
    });

    const { error, logContext } = mapProviderFailure(providerError);

    expect(error).toBeInstanceOf(APIError);
    const apiError = error as APIError;
    expect(apiError.status).toBe(httpStatus.UNPROCESSABLE_ENTITY);
    expect(apiError.isPublic).toBe(true);
    // The caller learns which stage failed (the payment provider) but never the raw body.
    expect(apiError.message).toContain("payment provider");
    expect(apiError.message.toLowerCase()).not.toContain("blocked");
    expect(apiError.message).not.toContain("user is blocked");

    // Logging pinpoints exactly which provider call failed, and why (server-side only).
    expect(logContext).toEqual({
      provider: "avenia",
      providerEndpoint: "/v2/account/tickets",
      providerMethod: "POST",
      providerResponseBody: JSON.stringify({ error: "user is blocked" }),
      providerStatus: 400
    });
  });

  it("classifies the mapped 4xx error as a provider_error for telemetry", () => {
    const { error } = mapProviderFailure(
      new BrlaApiError({
        endpoint: "/v2/account/tickets",
        method: "POST",
        responseBody: JSON.stringify({ error: "user is blocked" }),
        status: 400
      })
    );

    expect(classifyApiClientError(error)).toBe("provider_error");
  });

  it("maps a 5xx / transport Avenia failure to a 502 provider-unavailable message", () => {
    const providerError = new BrlaApiError({
      endpoint: "/v2/account/quote/fixed-rate",
      method: "GET",
      responseBody: "upstream exploded",
      status: 503
    });

    const { error, logContext } = mapProviderFailure(providerError);

    const apiError = error as APIError;
    expect(apiError.status).toBe(httpStatus.BAD_GATEWAY);
    expect(apiError.isPublic).toBe(true);
    expect(apiError.message).toContain("payment provider");
    expect(apiError.message).not.toContain("upstream exploded");
    expect(logContext.providerStatus).toBe(503);
    expect(logContext.providerEndpoint).toBe("/v2/account/quote/fixed-rate");
  });

  it("also generalizes to Alfredpay provider failures and tags the correct provider", () => {
    const providerError = new AlfredpayApiError({
      endpoint: "/customers",
      method: "POST",
      responseBody: JSON.stringify({ error: "customer rejected" }),
      status: 422
    });

    const { error, logContext } = mapProviderFailure(providerError);

    const apiError = error as APIError;
    expect(apiError.status).toBe(httpStatus.UNPROCESSABLE_ENTITY);
    expect(apiError.message).toContain("payment provider");
    expect(apiError.message).not.toContain("customer rejected");
    expect(logContext).toEqual({
      provider: "alfredpay",
      providerEndpoint: "/customers",
      providerMethod: "POST",
      providerResponseBody: JSON.stringify({ error: "customer rejected" }),
      providerStatus: 422
    });
    expect(classifyApiClientError(error)).toBe("provider_error");
  });

  it("maps a transport failure (status 0, no HTTP response) to a 502", () => {
    const providerError = new BrlaApiError({
      endpoint: "/v2/account/tickets",
      method: "POST",
      responseBody: "fetch failed: ECONNRESET",
      status: 0
    });

    const { error, logContext } = mapProviderFailure(providerError);

    expect((error as APIError).status).toBe(httpStatus.BAD_GATEWAY);
    expect(logContext.providerStatus).toBe(0);
  });

  it("truncates the logged provider response body to bound size/PII", () => {
    const providerError = new BrlaApiError({
      endpoint: "/v2/account/tickets",
      method: "POST",
      responseBody: "x".repeat(5000),
      status: 400
    });

    const { logContext } = mapProviderFailure(providerError);

    expect((logContext.providerResponseBody as string).length).toBe(300);
  });

  it("returns non-provider errors unchanged with empty log context", () => {
    const original = new APIError({ message: "Quote has expired", status: httpStatus.BAD_REQUEST });

    const { error, logContext } = mapProviderFailure(original);

    expect(error).toBe(original);
    expect(logContext).toEqual({});
  });

  it("passes through an unknown non-Error value unchanged", () => {
    const { error, logContext } = mapProviderFailure("boom");
    expect(error).toBe("boom");
    expect(logContext).toEqual({});
  });
});

describe("formatProviderContext", () => {
  it("embeds provider/call/status/body in the message suffix (logger drops metadata objects)", () => {
    const { logContext } = mapProviderFailure(
      new BrlaApiError({
        endpoint: "/v2/account/tickets",
        method: "POST",
        responseBody: JSON.stringify({ error: "user is blocked" }),
        status: 400
      })
    );

    const suffix = formatProviderContext(logContext);

    // The whole point of the fix: the failing Avenia call and reason must be in the message.
    expect(suffix).toContain("provider=avenia");
    expect(suffix).toContain("call=POST /v2/account/tickets");
    expect(suffix).toContain("status=400");
    expect(suffix).toContain('body={"error":"user is blocked"}');
  });

  it("returns an empty string for non-provider failures so their log line is unchanged", () => {
    expect(formatProviderContext({})).toBe("");
  });
});
