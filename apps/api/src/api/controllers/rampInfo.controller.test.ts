import { describe, expect, it, mock } from "bun:test";
import { Request, Response } from "express";
import { getRampInfo } from "./rampInfo.controller";

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

describe("getRampInfo controller", () => {
  it("requires a resolved credential and never accepts a caller-selected profile", async () => {
    const response = responseDouble();

    await getRampInfo({ query: { profileId: "other-profile" } } as unknown as Request, response as unknown as Response);

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "CREDENTIAL_REQUIRED" } });
  });
});
