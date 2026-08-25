import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Request, Response } from "express";
import * as rampInfoService from "../services/rampInfo.service";
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
  afterEach(() => mock.restore());

  it("requires a resolved credential and never accepts a caller-selected profile", async () => {
    const response = responseDouble();

    await getRampInfo({ query: { profileId: "other-profile" } } as unknown as Request, response as unknown as Response);

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "CREDENTIAL_REQUIRED" } });
  });

  it("resolves a verified managed child instead of the manager credential profile", async () => {
    const resolveRampInfo = spyOn(rampInfoService, "getRampInfo").mockResolvedValue({ corridors: {} } as never);
    const response = responseDouble();

    await getRampInfo(
      {
        credential: {
          credentialId: "credential-1",
          environment: "test",
          partnerId: null,
          profileId: "manager-1",
          strength: "secret"
        },
        managedProfileContext: {
          actorProfileId: "manager-1",
          customerEntityId: "entity-1",
          managedProfileId: "relationship-1",
          subjectProfileId: "child-1"
        }
      } as Request,
      response as unknown as Response
    );

    expect(resolveRampInfo).toHaveBeenCalledWith("child-1");
    expect(response.statusCode).toBe(200);
  });
});
