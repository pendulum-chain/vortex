import { describe, expect, it, mock } from "bun:test";
import { Request, Response } from "express";
import { getLimits } from "./limits.controller";

function responseDouble() {
  const response = {
    body: undefined as unknown,
    statusCode: 200,
    json: mock((body: unknown) => {
      response.body = body;
      return response;
    }),
    status: mock((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    })
  };
  return response;
}

describe("getLimits", () => {
  it("rejects a valid but unlinked credential", async () => {
    const response = responseDouble();

    await getLimits(
      { body: { corridors: ["US"] } } as Request,
      response as unknown as Response,
      mock(() => undefined)
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: "A user-scoped credential is required" });
  });

  it("rejects duplicate, unsupported, and unknown corridor input", async () => {
    for (const body of [
      { corridors: ["US", "US"] },
      { corridors: ["EU"] },
      { corridors: ["US"], userId: "other-user" }
    ]) {
      const response = responseDouble();
      await getLimits(
        { body, userId: "user-1" } as unknown as Request,
        response as unknown as Response,
        mock(() => undefined)
      );
      expect(response.statusCode).toBe(400);
    }
  });
});
