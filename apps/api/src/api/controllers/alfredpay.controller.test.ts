import { afterEach, describe, expect, it, mock } from "bun:test";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { AlfredpayController } from "./alfredpay.controller";

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
