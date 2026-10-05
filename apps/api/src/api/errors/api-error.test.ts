import { describe, expect, it } from "bun:test";
import httpStatus from "http-status";
import { APIError } from "./api-error";

class CustomAPIError extends APIError {}

describe("APIError", () => {
  it("defaults to a private 500 error", () => {
    const error = new APIError({ message: "boom" });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
    expect(error.name).toBe("APIError");
    expect(error.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    expect(error.isPublic).toBe(false);
    expect(error.isOperational).toBe(true);
    expect(error.errors).toBeUndefined();
    expect(error.type).toBeUndefined();
  });

  it("carries the supplied fields and names subclasses after their own class", () => {
    const error = new CustomAPIError({
      errors: ["a"],
      isPublic: true,
      message: "nope",
      stack: "custom stack",
      status: httpStatus.BAD_REQUEST,
      type: "entity.parse.failed"
    });

    expect(error).toBeInstanceOf(APIError);
    expect(error.name).toBe("CustomAPIError");
    expect(error.status).toBe(httpStatus.BAD_REQUEST);
    expect(error.isPublic).toBe(true);
    expect(error.errors).toEqual(["a"]);
    expect(error.stack).toBe("custom stack");
    expect(error.type).toBe("entity.parse.failed");
  });
});
