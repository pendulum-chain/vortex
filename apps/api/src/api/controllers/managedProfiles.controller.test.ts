import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import ApiCredential from "../../models/apiCredential.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestApiKey, createTestUser } from "../../test-utils/factories";
import managedProfilesRoutes from "../routes/v1/managed-profiles.route";

const BASE_PATH = "/v1/managed-profiles";

describe("managed profile lifecycle routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();
    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, managedProfilesRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => server?.close());
  beforeEach(resetTestDatabase);

  async function createManager(isActive = true) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive, profileId: manager.id });
    const credential = await createTestApiKey({ userId: manager.id });
    return { headers: { "Content-Type": "application/json", "X-API-Key": credential.plaintextKey }, manager };
  }

  it("requires manager authentication and active enablement", async () => {
    expect((await fetch(baseUrl)).status).toBe(401);
    const inactive = await createManager(false);
    expect((await fetch(baseUrl, { headers: inactive.headers })).status).toBe(403);
  });

  it("creates idempotently, lists active children, reads, and logically deletes", async () => {
    const { headers } = await createManager();
    const body = JSON.stringify({ customerType: "individual", externalSubjectId: "customer-1" });
    const created = await fetch(baseUrl, { body, headers, method: "POST" });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { managedProfile: { profileId: string } };
    const profileId = createdBody.managedProfile.profileId;
    expect(createdBody).toMatchObject({
      managedProfile: { creationSource: "manager", customerType: "individual", status: "active" }
    });

    expect((await fetch(baseUrl, { body, headers, method: "POST" })).status).toBe(200);
    const listed = await fetch(baseUrl, { headers });
    expect(await listed.json()).toMatchObject({
      managedProfiles: [{ profileId, status: "active" }],
      pagination: { limit: 50, offset: 0, total: 1 }
    });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers })).status).toBe(200);

    const childCredential = await createTestApiKey({ userId: profileId });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers, method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${baseUrl}/${profileId}`, { headers, method: "DELETE" })).status).toBe(204);
    expect((await ApiCredential.findByPk(childCredential.record.id))?.revokedAt).toBeInstanceOf(Date);

    const activeOnly = await fetch(baseUrl, { headers });
    expect(await activeOnly.json()).toMatchObject({ managedProfiles: [], pagination: { total: 0 } });
    const all = await fetch(`${baseUrl}?status=all`, { headers });
    expect(await all.json()).toMatchObject({ managedProfiles: [{ profileId, status: "deleted" }] });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers })).status).toBe(200);
    expect((await fetch(baseUrl, { body, headers, method: "POST" })).status).toBe(409);
  });

  it("returns not found for another manager's child", async () => {
    const first = await createManager();
    const second = await createManager();
    const created = await fetch(baseUrl, {
      body: JSON.stringify({ customerType: "business", externalSubjectId: "customer-private" }),
      headers: first.headers,
      method: "POST"
    });
    const profileId = ((await created.json()) as { managedProfile: { profileId: string } }).managedProfile.profileId;

    expect((await fetch(`${baseUrl}/${profileId}`, { headers: second.headers })).status).toBe(404);
    expect((await fetch(`${baseUrl}/${profileId}`, { headers: second.headers, method: "DELETE" })).status).toBe(404);
  });

  it("validates creation and list inputs", async () => {
    const { headers } = await createManager();
    expect(
      (
        await fetch(baseUrl, {
          body: JSON.stringify({ customerType: "technical", externalSubjectId: "customer" }),
          headers,
          method: "POST"
        })
      ).status
    ).toBe(400);
    expect((await fetch(`${baseUrl}?limit=101`, { headers })).status).toBe(400);
    expect((await fetch(`${baseUrl}/not-a-uuid`, { headers })).status).toBe(400);
  });
});
