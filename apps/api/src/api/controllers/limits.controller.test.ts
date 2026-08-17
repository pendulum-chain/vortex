import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Request, Response } from "express";
import * as limitsService from "../services/limits.service";
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
  afterEach(() => mock.restore());

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

  it("does not accept the legacy API key user field as identity", async () => {
    const response = responseDouble();

    await getLimits(
      { apiKeyUserId: "legacy-user", body: { corridors: ["US"] } } as unknown as Request,
      response as unknown as Response,
      mock(() => undefined)
    );

    expect(response.statusCode).toBe(403);
  });

  it("accepts a verified managed child as the effective user", async () => {
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });
    const response = responseDouble();

    await getLimits(
      {
        body: { corridors: ["US"] },
        managedProfileContext: {
          actorProfileId: "manager-1",
          customerEntityId: "entity-1",
          managedProfileId: "relationship-1",
          subjectProfileId: "child-1"
        },
        userId: "manager-1"
      } as unknown as Request,
      response as unknown as Response,
      mock(() => undefined)
    );

    expect(getUserLimits).toHaveBeenCalledWith("child-1", ["US"]);
    expect(response.body).toEqual({ limits: [] });
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
