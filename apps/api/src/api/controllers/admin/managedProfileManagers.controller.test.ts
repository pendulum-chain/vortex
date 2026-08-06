import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import managedProfileManagersRoutes from "../../routes/v1/admin/managed-profile-managers.route";
import { provisionManagedProfile } from "../../services/managed-profile-provisioning.service";

const BASE_PATH = "/v1/admin/managed-profile-managers";
const ADMIN_HEADERS = { Authorization: "Bearer test-admin-secret", "Content-Type": "application/json" };

describe("managed profile manager admin routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, managedProfileManagersRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function put(profileId: string, body: unknown, headers: Record<string, string> = ADMIN_HEADERS) {
    return fetch(`${baseUrl}/${profileId}`, { body: JSON.stringify(body), headers, method: "PUT" });
  }

  it("requires admin authentication", async () => {
    const response = await put(crypto.randomUUID(), { allowedCorridors: ["BR"], isActive: true }, {
      "Content-Type": "application/json"
    });
    expect(response.status).toBe(401);
  });

  it("creates, reads, and updates manager configuration", async () => {
    const profile = await createTestUser();

    const created = await put(profile.id, { allowedCorridors: ["BR", "EU"], isActive: true });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      manager: { allowedCorridors: ["BR", "EU"], isActive: true, profileId: profile.id }
    });

    const read = await fetch(`${baseUrl}/${profile.id}`, { headers: ADMIN_HEADERS });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      manager: { allowedCorridors: ["BR", "EU"], isActive: true, profileId: profile.id }
    });

    const updated = await put(profile.id, { allowedCorridors: ["US"], isActive: false });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      manager: { allowedCorridors: ["US"], isActive: false, profileId: profile.id }
    });
    expect(await ManagedProfileManager.count({ where: { profileId: profile.id } })).toBe(1);
  });

  it("rejects invalid configuration input", async () => {
    const profile = await createTestUser();

    for (const body of [
      { allowedCorridors: [], isActive: true },
      { allowedCorridors: ["BR", "BR"], isActive: true },
      { allowedCorridors: ["ZZ"], isActive: true },
      { allowedCorridors: ["BR"] }
    ]) {
      const response = await put(profile.id, body);
      expect(response.status).toBe(400);
    }
    expect(await ManagedProfileManager.count()).toBe(0);

    const malformedPut = await put("not-a-uuid", { allowedCorridors: ["BR"], isActive: true });
    expect(malformedPut.status).toBe(400);
    const malformedGet = await fetch(`${baseUrl}/not-a-uuid`, { headers: ADMIN_HEADERS });
    expect(malformedGet.status).toBe(400);
  });

  it("rejects managed child profiles as managers", async () => {
    const manager = await createTestUser();
    expect((await put(manager.id, { allowedCorridors: ["BR"], isActive: true })).status).toBe(201);
    const child = await provisionManagedProfile({
      creationSource: "vortex",
      customerType: "individual",
      externalSubjectId: "child-subject",
      managerProfileId: manager.id
    });

    const response = await put(child.profileId, { allowedCorridors: ["BR"], isActive: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_MANAGER_PROFILE_INVALID" } });
  });

  it("returns not found for unknown profiles and configurations", async () => {
    const unknownProfileId = crypto.randomUUID();
    const configured = await put(unknownProfileId, { allowedCorridors: ["BR"], isActive: true });
    expect(configured.status).toBe(404);

    const profile = await createTestUser();
    const read = await fetch(`${baseUrl}/${profile.id}`, { headers: ADMIN_HEADERS });
    expect(read.status).toBe(404);
  });
});
