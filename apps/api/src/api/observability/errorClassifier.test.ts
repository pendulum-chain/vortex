import { describe, expect, it } from "bun:test";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import { classifyApiClientError } from "./errorClassifier";

describe("classifyApiClientError", () => {
  it("classifies common quote and ramp errors", () => {
    expect(classifyApiClientError(new APIError({ message: "Quote not found", status: httpStatus.NOT_FOUND }))).toBe(
      "quote_not_found"
    );
    expect(classifyApiClientError(new APIError({ message: "Quote has expired", status: httpStatus.BAD_REQUEST }))).toBe(
      "quote_expired"
    );
    expect(classifyApiClientError(new APIError({ message: "No presigned transactions found", status: httpStatus.BAD_REQUEST }))).toBe(
      "missing_presigned_transactions"
    );
  });

  it("classifies auth and ownership failures", () => {
    expect(classifyApiClientError(new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED }))).toBe(
      "auth_missing_api_key"
    );
    expect(classifyApiClientError(new APIError({ message: "Authenticated user does not own this ramp", status: httpStatus.FORBIDDEN }))).toBe(
      "ownership_denied"
    );
  });
});
