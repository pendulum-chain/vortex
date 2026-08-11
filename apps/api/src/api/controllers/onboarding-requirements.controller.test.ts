import { describe, expect, it, mock } from "bun:test";
import type { Request, Response } from "express";
import { getOnboardingRequirements } from "./onboarding.controller";

function createResponse() {
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

describe("getOnboardingRequirements", () => {
  it("returns public requirements case-insensitively", () => {
    const response = createResponse();

    getOnboardingRequirements(
      { query: { country: "br", customerType: "BUSINESS" } } as unknown as Request,
      response as unknown as Response
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      country: "BR",
      customerType: "business",
      flow: "avenia-br-business-level-1-api-kyb",
      provider: "avenia"
    });
  });

  it("rejects incomplete queries", () => {
    const response = createResponse();

    getOnboardingRequirements({ query: { country: "BR" } } as unknown as Request, response as unknown as Response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_ONBOARDING_REQUIREMENTS_QUERY" } });
  });

  it("does not advertise unsupported provider flows", () => {
    const response = createResponse();

    getOnboardingRequirements(
      { query: { country: "AR", customerType: "business" } } as unknown as Request,
      response as unknown as Response
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ONBOARDING_REQUIREMENTS_NOT_FOUND" } });
  });

  it("leaves Monerium outside this discovery proposal", () => {
    const response = createResponse();

    getOnboardingRequirements(
      { query: { country: "EU", customerType: "individual" } } as unknown as Request,
      response as unknown as Response
    );

    expect(response.statusCode).toBe(404);
  });
});
