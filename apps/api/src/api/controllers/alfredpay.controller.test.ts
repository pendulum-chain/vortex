import { afterEach, describe, expect, it, mock } from "bun:test";
import { AlfredpayApiError } from "@vortexfi/shared";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { AlfredpayController, mapFiatAccountProviderRejection } from "./alfredpay.controller";

function createResponse() {
  const res = {
    body: undefined as unknown,
    json: mock((body: unknown) => {
      res.body = body;
      return res;
    }),
    status: mock((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    }),
    statusCode: Number(httpStatus.OK)
  };

  return res;
}

describe("Alfredpay fiat account endpoints", () => {
  const originalLoggerError = logger.error;

  afterEach(() => {
    logger.error = originalLoggerError;
  });

  it("returns a user-binding error for valid secret keys that are not linked to a user", async () => {
    logger.error = mock(() => logger) as typeof logger.error;

    const res = createResponse();
    await AlfredpayController.listFiatAccounts(
      {
        authenticatedPartner: { id: "partner-1", name: "Partner" },
        query: { country: "MX" }
      } as never,
      res as never
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({
      error: "This endpoint requires an API key linked to a user or Supabase user authentication."
    });
  });
});

function providerError(status: number, responseBody: string): AlfredpayApiError {
  return new AlfredpayApiError({ endpoint: "customers/x/fiataccounts", method: "POST", responseBody, status });
}

describe("mapFiatAccountProviderRejection", () => {
  it("maps an invalid account number (111484) to a field error", () => {
    const mapped = mapFiatAccountProviderRejection(
      providerError(400, '{"errorCode":111484,"errorMessage":"Account number not valid"}')
    );
    expect(mapped?.error).toBe("The payout provider rejected this account number. Double-check it and try again.");
    expect(mapped?.fields).toEqual([
      { field: "accountNumber", message: "This account number was rejected by the payout provider." }
    ]);
  });

  it("maps a duplicate account (111485) without field errors", () => {
    const mapped = mapFiatAccountProviderRejection(
      providerError(400, '{"errorCode":111485,"errorMessage":"Fiat account for already exists"}')
    );
    expect(mapped?.error).toBe("This account is already registered as a payout account.");
    expect(mapped?.fields).toBeUndefined();
  });

  it("maps the UNKNOWN_ERROR catch-all (111301, seen for nonexistent CBUs) to a verification message", () => {
    const mapped = mapFiatAccountProviderRejection(providerError(400, '{"errorCode":111301,"errorMessage":"UNKNOWN_ERROR"}'));
    expect(mapped?.error).toBe("The payout provider could not verify this account. Double-check the details and try again.");
  });

  it("never forwards the raw provider body", () => {
    const mapped = mapFiatAccountProviderRejection(
      providerError(400, '{"errorCode":110002,"errorMessage":"Invalid field(s)","internal":"upstream detail"}')
    );
    expect(JSON.stringify(mapped)).not.toContain("Invalid field(s)");
    expect(JSON.stringify(mapped)).not.toContain("upstream detail");
  });

  it("maps a non-JSON 4xx body to the generic verification message", () => {
    const mapped = mapFiatAccountProviderRejection(providerError(400, "<html>Bad Request</html>"));
    expect(mapped?.error).toBe("The payout provider could not verify this account. Double-check the details and try again.");
  });

  it("returns null for provider 5xx responses, transport failures, and non-provider errors", () => {
    expect(mapFiatAccountProviderRejection(providerError(500, '{"errorCode":111301,"errorMessage":"UNKNOWN_ERROR"}'))).toBeNull();
    expect(mapFiatAccountProviderRejection(providerError(0, ""))).toBeNull();
    expect(mapFiatAccountProviderRejection(new Error("boom"))).toBeNull();
  });
});
