import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MoneriumApiError, MoneriumApiService } from "@vortexfi/shared";
import { provisionMoneriumB2bAccount } from "../api/services/monerium-b2b/account-provisioning";
import { config } from "../config/vars";
import ManagedProfileManager from "../models/managedProfileManager.model";
import MoneriumAccountRegistration from "../models/moneriumAccountRegistration.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const DESTINATION = "0x2222222222222222222222222222222222222222";
const PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";

describe("POST /v1/monerium-b2b/accounts", () => {
  let app: TestApp;
  let world: FakeWorld;
  const saved = { partner: config.moneriumB2b.partnerManagerProfileId, rpcUrl: config.moneriumB2b.rpcUrl };

  beforeAll(async () => {
    config.moneriumB2b.rpcUrl = undefined; // provisioning skips the on-chain clone check
    world = installFakeWorld();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    config.moneriumB2b.rpcUrl = saved.rpcUrl;
    await app?.close();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    mock.restore();
    config.moneriumB2b.partnerManagerProfileId = saved.partner;
  });

  /** The partner's white-label app: profiles it can see, by state; anything else is a 404. */
  function moneriumProfiles(states: Record<string, string>) {
    spyOn(MoneriumApiService, "getInstance").mockReturnValue({
      getProfile: async (id: string) => {
        if (!states[id]) throw new MoneriumApiError({ endpoint: "/profiles/:profile", method: "GET", status: 404 });
        return { id, state: states[id] };
      }
    } as unknown as MoneriumApiService);
  }

  async function manager(bound = true) {
    const profile = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: profile.id
    });
    const credential = await createTestApiKey({ userId: profile.id });
    if (bound) config.moneriumB2b.partnerManagerProfileId = profile.id;
    return { headers: { "Content-Type": "application/json", "X-API-Key": credential.plaintextKey }, profileId: profile.id };
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    contactEmail: "ops@client.example.com",
    destination: DESTINATION,
    externalSubjectId: "client-1",
    moneriumProfileId: PROFILE,
    ...overrides
  });

  async function register(headers: Record<string, string>, payload: unknown) {
    const response = await app.request("/v1/monerium-b2b/accounts", { body: JSON.stringify(payload), headers, method: "POST" });
    return { body: (await response.json()) as Record<string, any>, status: response.status };
  }

  it("registers a destination once, replays it, and never overwrites it", async () => {
    const { headers } = await manager();
    moneriumProfiles({ [PROFILE]: "pending" });

    const created = await register(headers, body());
    expect(created.status).toBe(202);
    expect(created.body.registration).toMatchObject({
      accountId: null,
      destination: DESTINATION,
      externalSubjectId: "client-1",
      moneriumProfileId: PROFILE,
      rejectedReason: null,
      status: "requested"
    });

    const replayed = await register(headers, body({ contactEmail: "OPS@client.example.com" }));
    expect(replayed.status).toBe(200);
    expect(replayed.body.registration).toEqual(created.body.registration);

    for (const changed of [body({ destination: "0x3333333333333333333333333333333333333333" }), body({ externalSubjectId: "client-2" })]) {
      const conflict = await register(headers, changed);
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({ error: { code: "MONERIUM_B2B_DESTINATION_CONFLICT" } });
    }
    expect(await MoneriumAccountRegistration.count()).toBe(1);
  });

  it("refuses a profile the partner's app cannot see, or that Monerium rejected", async () => {
    const { headers } = await manager();
    const rejectedProfile = crypto.randomUUID();
    moneriumProfiles({ [rejectedProfile]: "rejected" });

    for (const moneriumProfileId of [PROFILE, rejectedProfile]) {
      const response = await register(headers, body({ moneriumProfileId }));
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_PROFILE_UNAVAILABLE" } });
    }
    expect(await MoneriumAccountRegistration.count()).toBe(0);
  });

  it("validates the profile ID, the destination and the client details", async () => {
    const { headers } = await manager();
    moneriumProfiles({ [PROFILE]: "approved" });

    for (const invalid of [
      body({ moneriumProfileId: "not-a-uuid" }),
      body({ destination: "0x9965507d1a55bcC2695C58ba16FB37d819B0A4dc" }), // mixed case with a broken checksum
      body({ destination: "0x0000000000000000000000000000000000000000" }),
      body({ destination: "0x1234" }),
      body({ externalSubjectId: " " }),
      body({ contactEmail: "not-an-email" }),
      body({ contactEmail: undefined })
    ]) {
      const response = await register(headers, invalid);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_INVALID_INPUT" } });
    }
    expect((await register(headers, body({ destination: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" }))).status).toBe(202);
  });

  it("accepts only the manager bound to the white-label app, with its own key", async () => {
    moneriumProfiles({ [PROFILE]: "approved" });
    const other = await manager(false);
    const partner = await manager();

    expect((await register(other.headers, body())).status).toBe(403);
    expect((await register({ ...partner.headers, "X-Managed-Profile-Id": crypto.randomUUID() }, body())).status).toBe(400);
    const unauthenticated = await app.request("/v1/monerium-b2b/accounts", {
      body: JSON.stringify(body()),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(unauthenticated.status).toBe(401);

    config.moneriumB2b.partnerManagerProfileId = undefined;
    expect((await register(partner.headers, body())).status).toBe(403);
    expect(await MoneriumAccountRegistration.count()).toBe(0);
  });

  it("refuses a profile that already has an account", async () => {
    const { headers, profileId } = await manager();
    moneriumProfiles({ [PROFILE]: "approved" });
    await provisionMoneriumB2bAccount({
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      managerProfileId: profileId,
      moneriumProfileId: PROFILE
    });

    const response = await register(headers, body());
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_DESTINATION_CONFLICT" } });
  });
});
