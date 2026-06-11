import {describe, expect, it} from "bun:test";
import httpStatus from "http-status";
import {APIError} from "../errors/api-error";
import {handler} from "./error";

function createMockResponse() {
  const response = {
    body: undefined as unknown,
    statusCode: undefined as number | undefined,
    json(body: unknown) {
      response.body = body;
      return response;
    },
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    }
  };

  return response;
}

describe("error middleware", () => {
  it("masks non-public internal server errors in production-like environments", () => {
    const response = createMockResponse();

    handler(
      new APIError({ message: "provider secret details", status: httpStatus.INTERNAL_SERVER_ERROR }),
      undefined as never,
      response as never,
      undefined as never
    );

    expect(response.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    expect(response.body).toMatchObject({
      code: httpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error"
    });
  });

  it("preserves explicitly public internal server error messages", () => {
    const response = createMockResponse();

    handler(
      new APIError({
        isPublic: true,
        message: "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon.",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }),
      undefined as never,
      response as never,
      undefined as never
    );

    expect(response.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    expect(response.body).toMatchObject({
      code: httpStatus.INTERNAL_SERVER_ERROR,
      message: "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon."
    });
  });
});
