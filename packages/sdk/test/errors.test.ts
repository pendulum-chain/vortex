import {describe, expect, test} from "bun:test";
import {AlfredpayOnrampKycRequiredError, parseAPIError, VortexSdkError} from "../src/errors";

describe("parseAPIError", () => {
  test("uses API error code when status is omitted", () => {
    const error = parseAPIError({ code: 401, message: "Authentication required" });

    expect(error).toBeInstanceOf(VortexSdkError);
    expect(error.status).toBe(401);
    expect(error.message).toBe("Authentication required");
  });

  test("uses nested API error status", () => {
    const error = parseAPIError({ error: { message: "Invalid or expired Bearer token.", status: 401 } });

    expect(error.status).toBe(401);
    expect(error.message).toBe("Invalid or expired Bearer token.");
  });

  test("maps Alfredpay onramp auth and KYC errors", () => {
    const error = parseAPIError({
      code: 401,
      message:
        "Alfredpay onramp requires a completed Alfredpay KYC profile. Partner API-key-only registration is not supported for this flow yet because no partner user-to-Alfredpay-customer mapping exists."
    });

    expect(error).toBeInstanceOf(AlfredpayOnrampKycRequiredError);
    expect(error.status).toBe(401);
  });
});
