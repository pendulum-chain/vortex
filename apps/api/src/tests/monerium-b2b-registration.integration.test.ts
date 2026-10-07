import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MoneriumApiError, MoneriumApiService } from "@vortexfi/shared";
import { provisionMoneriumB2bAccount } from "../api/services/monerium-b2b/account-provisioning";
import { createSession } from "../api/services/impersonation.service";
import { config } from "../config/vars";
import ManagedProfileManager from "../models/managedProfileManager.model";
import MoneriumAccountRegistration, { MoneriumAccountRegistrationStatus } from "../models/moneriumAccountRegistration.model";
import ProfileRole from "../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const DESTINATION = "0x2222222222222222222222222222222222222222";
const PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";

describe("POST /v1/monerium-b2b/accounts", () => {
  let app: TestApp;
  let world: FakeWorld;
  const saved = {
    impersonation: config.impersonationEnabled,
    partner: config.moneriumB2b.partnerManagerProfileId,
    rpcUrl: config.moneriumB2b.rpcUrl
  };

  beforeAll(async () => {
    config.moneriumB2b.rpcUrl = undefined; // provisioning skips the on-chain clone check
    world = installFakeWorld();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    config.moneriumB2b.rpcUrl = saved.rpcUrl;
    config.impersonationEnabled = saved.impersonation;
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

  /**
   * The partner's white-label app: profiles it can see, by state, or a Monerium HTTP status to fail
   * with; anything else is a 404. `beforeAnswer` runs before each answer (a concurrent request).
   */
  function moneriumProfiles(states: Record<string, string | number>, beforeAnswer?: () => Promise<unknown>) {
    spyOn(MoneriumApiService, "getInstance").mockReturnValue({
      getProfile: async (id: string) => {
        await beforeAnswer?.();
        const state = states[id];
        if (state === undefined || typeof state === "number") {
          throw new MoneriumApiError({ endpoint: "/profiles/:profile", method: "GET", status: state ?? 404 });
        }
        return { id, state };
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

    for (const changed of [
      body({ destination: "0x3333333333333333333333333333333333333333" }),
      body({ externalSubjectId: "client-2" }),
      body({ contactEmail: "finance@client.example.com" })
    ]) {
      const conflict = await register(headers, changed);
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({ error: { code: "MONERIUM_B2B_DESTINATION_CONFLICT" } });
    }
    expect(await MoneriumAccountRegistration.count()).toBe(1);
  });

  it("lists the manager's registrations, filterable by profile and paged, and nobody else's", async () => {
    const { headers } = await manager();
    const secondProfile = crypto.randomUUID();
    moneriumProfiles({ [PROFILE]: "pending", [secondProfile]: "pending" });
    const created = await register(headers, body());
    const list = async (path: string, listHeaders: Record<string, string> = headers) => {
      const response = await app.request(path, { headers: listHeaders, method: "GET" });
      return { body: (await response.json()) as Record<string, any>, status: response.status };
    };

    const all = await list("/v1/monerium-b2b/registrations");
    expect(all.status).toBe(200);
    expect(all.body).toEqual({ pagination: { limit: 20, offset: 0, total: 1 }, registrations: [created.body.registration] });
    expect((await list(`/v1/monerium-b2b/registrations?moneriumProfileId=${PROFILE}`)).body.registrations).toHaveLength(1);
    expect((await list(`/v1/monerium-b2b/registrations?moneriumProfileId=${crypto.randomUUID()}`)).body.registrations).toHaveLength(0);
    expect((await list("/v1/monerium-b2b/registrations?moneriumProfileId=nope")).status).toBe(400);
    expect((await list("/v1/monerium-b2b/registrations", { ...headers, "X-Managed-Profile-Id": crypto.randomUUID() })).status).toBe(400);

    const other = await manager(false);
    expect((await list("/v1/monerium-b2b/registrations", other.headers)).body.registrations).toHaveLength(0);

    const second = await register(
      headers,
      body({ contactEmail: "ops@second.example.com", externalSubjectId: "client-2", moneriumProfileId: secondProfile })
    );
    const paged = await list("/v1/monerium-b2b/registrations?limit=1&offset=1");
    expect(paged.body).toEqual({ pagination: { limit: 1, offset: 1, total: 2 }, registrations: [created.body.registration] });
    expect((await list("/v1/monerium-b2b/registrations?limit=1")).body.registrations).toEqual([second.body.registration]);
    expect((await list("/v1/monerium-b2b/registrations?offset=1e21")).body).toMatchObject({ registrations: [] });
  });

  it("refuses a profile the partner's app cannot see, or that Monerium rejected or closed", async () => {
    const { headers } = await manager();
    const rejectedProfile = crypto.randomUUID();
    const closedProfile = crypto.randomUUID();
    moneriumProfiles({ [closedProfile]: "closed", [rejectedProfile]: "rejected" });

    for (const moneriumProfileId of [PROFILE, rejectedProfile, closedProfile]) {
      const response = await register(headers, body({ moneriumProfileId }));
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_PROFILE_UNAVAILABLE" } });
    }
    expect(await MoneriumAccountRegistration.count()).toBe(0);
  });

  it("answers 503 when Monerium fails or refuses access, never blaming the partner's input", async () => {
    const { headers } = await manager();
    for (const status of [0, 403, 429, 503]) {
      moneriumProfiles({ [PROFILE]: status });
      const response = await register(headers, body());
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_PROVIDER_UNAVAILABLE" } });
      mock.restore();
    }
    expect(await MoneriumAccountRegistration.count()).toBe(0);
  });

  it("replays a registration created by a concurrent identical request, and refuses a different one", async () => {
    const { headers, profileId } = await manager();
    const concurrent = (destination: string) => () =>
      MoneriumAccountRegistration.findOrCreate({
        defaults: {
          contactEmail: "ops@client.example.com",
          destination,
          externalSubjectId: "client-1",
          managerProfileId: profileId,
          moneriumProfileId: PROFILE
        },
        where: { moneriumProfileId: PROFILE }
      });

    moneriumProfiles({ [PROFILE]: "pending" }, concurrent(DESTINATION));
    const replayed = await register(headers, body());
    expect(replayed.status).toBe(200);
    expect(replayed.body.registration).toMatchObject({ destination: DESTINATION, status: "requested" });

    await resetTestDatabase();
    const again = await manager();
    mock.restore();
    moneriumProfiles({ [PROFILE]: "pending" }, () =>
      MoneriumAccountRegistration.create({
        contactEmail: "ops@client.example.com",
        destination: "0x3333333333333333333333333333333333333333",
        externalSubjectId: "client-1",
        managerProfileId: again.profileId,
        moneriumProfileId: PROFILE
      })
    );
    const conflict = await register(again.headers, body());
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: { code: "MONERIUM_B2B_DESTINATION_CONFLICT" } });
  });

  it("lets the partner register a rejected profile again, with corrected data", async () => {
    const { headers } = await manager();
    moneriumProfiles({ [PROFILE]: "pending" });
    await register(headers, body());
    await MoneriumAccountRegistration.update(
      { rejectedReason: "Withdrawn by Vortex operations", status: MoneriumAccountRegistrationStatus.Rejected },
      { where: { moneriumProfileId: PROFILE } }
    );

    const corrected = await register(headers, body({ destination: "0x3333333333333333333333333333333333333333" }));
    expect(corrected.status).toBe(202);
    expect(corrected.body.registration).toMatchObject({
      destination: "0x3333333333333333333333333333333333333333",
      rejectedReason: null,
      status: "requested",
      waitingReason: null
    });
    expect(await MoneriumAccountRegistration.count()).toBe(1);
    expect((await register(headers, body({ destination: "0x3333333333333333333333333333333333333333" }))).status).toBe(200);
  });

  it("refuses a client reference or contact email that belongs to another client", async () => {
    const { headers, profileId } = await manager();
    const otherProfile = crypto.randomUUID();
    moneriumProfiles({ [PROFILE]: "approved", [otherProfile]: "approved" });
    await provisionMoneriumB2bAccount({
      contactEmail: "someone-else@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      managerProfileId: profileId,
      moneriumProfileId: otherProfile
    });

    for (const conflicting of [body(), body({ contactEmail: "someone-else@client.example.com", externalSubjectId: "client-9" })]) {
      const response = await register(headers, conflicting);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_CLIENT_CONFLICT" } });
    }

    const pendingProfile = crypto.randomUUID();
    mock.restore();
    moneriumProfiles({ [PROFILE]: "approved", [pendingProfile]: "pending" });
    expect((await register(headers, body({ externalSubjectId: "client-2", moneriumProfileId: pendingProfile }))).status).toBe(202);
    const duplicate = await register(headers, body({ contactEmail: "new@client.example.com", externalSubjectId: "client-2" }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ error: { code: "MONERIUM_B2B_CLIENT_CONFLICT" } });
  });

  it("refuses a registration made with an impersonation token, but lets it read", async () => {
    const partner = await manager();
    moneriumProfiles({ [PROFILE]: "approved" });
    config.impersonationEnabled = true;
    const actor = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: partner.profileId });
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const response = await register(headers, body());
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "IMPERSONATION_NOT_ALLOWED" } });
    expect(await MoneriumAccountRegistration.count()).toBe(0);
    expect((await app.request("/v1/monerium-b2b/registrations", { headers, method: "GET" })).status).toBe(200);
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
