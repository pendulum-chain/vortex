import { afterEach, describe, expect, it, mock } from "bun:test";
import { Request, Response } from "express";
import ApiCredential from "../../models/apiCredential.model";
import { listUserApiKeys, revokeUserApiKey } from "./userApiKeys.controller";

const originals = {
  findAll: ApiCredential.findAll,
  update: ApiCredential.update
};

afterEach(() => {
  ApiCredential.findAll = originals.findAll;
  ApiCredential.update = originals.update;
});

function responseDouble() {
  const response = {
    body: undefined as unknown,
    statusCode: 200,
    json: mock((body: unknown) => {
      response.body = body;
      return response;
    }),
    send: mock(() => response),
    status: mock((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    })
  };
  return response;
}

function credentialRow(overrides: Record<string, unknown>) {
  return ApiCredential.build({
    createdAt: new Date("2026-08-03T00:00:00Z"),
    environment: "live",
    expiresAt: new Date("2027-08-03T00:00:00Z"),
    name: "key",
    partnerId: null,
    profileId: "profile-1",
    publicKeyValue: "pk_live_x",
    publicLastUsedAt: null,
    revokedAt: null,
    secretKeyPrefix: "sk_live_x",
    secretLastUsedAt: null,
    updatedAt: new Date("2026-08-03T00:00:00Z"),
    ...overrides
  } as never);
}

describe("listUserApiKeys", () => {
  it("lists partner-scoped credentials alongside profile-owned ones", async () => {
    let findWhere: Record<PropertyKey, unknown> = {};
    ApiCredential.findAll = mock(async (options: { where: Record<PropertyKey, unknown> }) => {
      findWhere = options.where;
      return [
        credentialRow({ id: "credential-own", partnerId: null }),
        credentialRow({ id: "credential-partner", partnerId: "partner-1" })
      ];
    }) as never;
    const response = responseDouble();

    await listUserApiKeys({ userId: "profile-1" } as Request, response as unknown as Response);

    expect(findWhere).toEqual({ profileId: "profile-1" });
    expect(response.statusCode).toBe(200);
    const credentials = (response.body as { credentials: { id: string; partnerId: string | null }[] }).credentials;
    expect(credentials.map(credential => credential.id)).toEqual(["credential-own", "credential-partner"]);
  });
});

describe("revokeUserApiKey", () => {
  it("revokes a partner-scoped credential owned by the profile", async () => {
    let updateWhere: Record<PropertyKey, unknown> = {};
    ApiCredential.update = mock(async (_values: unknown, options: { where: Record<PropertyKey, unknown> }) => {
      updateWhere = options.where;
      return [1];
    }) as never;
    const response = responseDouble();

    await revokeUserApiKey(
      { params: { credentialId: "credential-partner" }, userId: "profile-1" } as unknown as Request<{ credentialId?: string }>,
      response as unknown as Response
    );

    expect(updateWhere).toEqual({ id: "credential-partner", profileId: "profile-1", revokedAt: null });
    expect(response.statusCode).toBe(204);
    expect(response.send).toHaveBeenCalled();
  });
});
