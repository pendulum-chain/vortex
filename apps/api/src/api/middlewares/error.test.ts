import { describe, expect, it } from "bun:test";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import { converter, handler } from "./error";

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

  it.each([
    ["entity.parse.failed", httpStatus.BAD_REQUEST, "Invalid JSON payload"],
    ["entity.too.large", httpStatus.REQUEST_ENTITY_TOO_LARGE, "Request body too large"]
  ])("preserves public body-parser %s errors", (type, status, message) => {
    const response = createMockResponse();
    const error = Object.assign(new SyntaxError("unsafe parser detail"), { status, type });

    converter(error, undefined as never, response as never, undefined as never);

    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ code: status, message, statusCode: status, type });
    expect(JSON.stringify(response.body)).not.toContain("unsafe parser detail");
  });
});
