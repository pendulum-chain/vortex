import {describe, expect, test} from "bun:test";
import {
  AlfredpayOnrampKycRequiredError,
  MissingAlfredpayOfframpParametersError,
  MissingBrlOfframpParametersError,
  MissingBrlParametersError,
  parseAPIError,
  VortexSdkError
} from "../src/errors";

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

  // Regression: the backend dropped taxId from these messages once taxId became
  // server-derived. The parser must match the current strings, not the legacy ones.
  test("maps the current BRL onramp missing-parameter message", () => {
    const error = parseAPIError({ code: 400, message: "Parameter destinationAddress is required for onramp" });

    expect(error).toBeInstanceOf(MissingBrlParametersError);
    expect(error.status).toBe(400);
  });

  test("maps the current BRL offramp missing-parameter message", () => {
    const error = parseAPIError({ code: 400, message: "pixDestination is required for offramp to BRL" });

    expect(error).toBeInstanceOf(MissingBrlOfframpParametersError);
    expect(error.status).toBe(400);
  });

  test("does not map the retired legacy BRL messages to the named errors", () => {
    const onramp = parseAPIError({ code: 400, message: "Parameters destinationAddress and taxId are required for onramp" });
    const offramp = parseAPIError({
      code: 400,
      message: "receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL"
    });

    expect(onramp).not.toBeInstanceOf(MissingBrlParametersError);
    expect(offramp).not.toBeInstanceOf(MissingBrlOfframpParametersError);
  });

  // The missing-walletAddress message is shared across BRL/Alfredpay/Mykobo offramps
  // and carries no corridor, so it maps to the Alfredpay class regardless of corridor.
  test("maps the shared missing-walletAddress offramp message", () => {
    const error = parseAPIError({ code: 400, message: "User address must be provided for offramping." });

    expect(error).toBeInstanceOf(MissingAlfredpayOfframpParametersError);
    expect(error.status).toBe(400);
  });

  test("named BRL parameter errors default to the current backend messages", () => {
    expect(new MissingBrlParametersError().message).toBe("Parameter destinationAddress is required for onramp");
    expect(new MissingBrlOfframpParametersError().message).toBe("pixDestination is required for offramp to BRL");
  });
});
