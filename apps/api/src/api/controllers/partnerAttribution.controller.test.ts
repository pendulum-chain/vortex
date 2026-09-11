import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import ProfilePartnerAssignment from "../../models/profilePartnerAssignment.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestApiKey, createTestPartner, createTestUser } from "../../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import partnerAttributionRoutes from "../routes/v1/partner-attribution.route";

const BASE_PATH = "/v1/partner-attribution";

describe("partner attribution claim route", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;
  let auth: FakeSupabaseAuth;

  beforeAll(async () => {
    await setupTestDatabase();
    auth = installFakeSupabaseAuth();
    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, partnerAttributionRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}/claim`;
  });

  afterAll(() => {
    auth.restore();
    server?.close();
  });
  beforeEach(resetTestDatabase);

  function claim(token: string | null, publicKey?: string) {
    return fetch(baseUrl, {
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(publicKey ? { "x-public-key": publicKey } : {})
      },
      method: "POST"
    });
  }

  it("requires a Supabase user token", async () => {
    const partner = await createTestPartner();
    const { publicKey } = await createTestApiKey({ partnerName: partner.name });
    expect((await claim(null, publicKey)).status).toBe(401);
    expect(await ProfilePartnerAssignment.count()).toBe(0);
  });

  it("requires a valid public key", async () => {
    const user = await createTestUser();
    expect((await claim(testUserToken(user.id))).status).toBe(400);
    expect((await claim(testUserToken(user.id), `pk_test_${"a".repeat(32)}`)).status).toBe(401);
    const { plaintextKey } = await createTestApiKey();
    expect((await claim(testUserToken(user.id), plaintextKey)).status).toBe(400);
    expect(await ProfilePartnerAssignment.count()).toBe(0);
  });

  it("assigns the credential's partner to the authenticated profile exactly once", async () => {
    const user = await createTestUser();
    const partner = await createTestPartner();
    const { publicKey } = await createTestApiKey({ partnerName: partner.name });

    const first = await claim(testUserToken(user.id), publicKey);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ outcome: "created" });
    expect(await ProfilePartnerAssignment.findAll({ where: { userId: user.id } })).toMatchObject([
      { isActive: true, partnerId: partner.id, partnerName: partner.name }
    ]);

    const second = await claim(testUserToken(user.id), publicKey);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ outcome: "skipped_existing_assignment" });
    expect(await ProfilePartnerAssignment.count({ where: { userId: user.id } })).toBe(1);
  });

  it("keeps an existing assignment when a different partner's key is presented", async () => {
    const user = await createTestUser();
    const firstPartner = await createTestPartner();
    const secondPartner = await createTestPartner();
    const { publicKey: firstKey } = await createTestApiKey({ partnerName: firstPartner.name });
    const { publicKey: secondKey } = await createTestApiKey({ partnerName: secondPartner.name });

    expect(await (await claim(testUserToken(user.id), firstKey)).json()).toEqual({ outcome: "created" });
    expect(await (await claim(testUserToken(user.id), secondKey)).json()).toEqual({ outcome: "skipped_existing_assignment" });

    const active = await ProfilePartnerAssignment.findAll({ where: { isActive: true, userId: user.id } });
    expect(active).toHaveLength(1);
    expect(active[0].partnerId).toBe(firstPartner.id);
  });

  it("no-ops for keys without partner attribution", async () => {
    const user = await createTestUser();
    const { publicKey } = await createTestApiKey();

    const response = await claim(testUserToken(user.id), publicKey);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "no_partner_attribution" });
    expect(await ProfilePartnerAssignment.count()).toBe(0);
  });
});
