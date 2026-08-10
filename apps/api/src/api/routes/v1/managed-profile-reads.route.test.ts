import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import CustomerEntity from "../../../models/customerEntity.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import User from "../../../models/user.model";
import * as apiKeyAuthHelpers from "../../middlewares/apiKeyAuth.helpers";
import * as limitsService from "../../services/limits.service";
import * as rampInfoService from "../../services/rampInfo.service";
import { SupabaseAuthService } from "../../services/auth";
import limitsRoutes from "./limits.route";
import rampInfoRoutes from "./ramp-info.route";

const MANAGER_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const SECRET_KEY = `sk_test_${"a".repeat(32)}`;
const PUBLIC_KEY = `pk_test_${"b".repeat(32)}`;

describe("managed profile read routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use("/v1/limits", limitsRoutes);
    app.use("/v1/ramp-info", rampInfoRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => mock.restore());
  afterAll(() => server.close());

  function allowManagedProfile(allowedCorridors = ["BR", "MX", "US"]): void {
    spyOn(ManagedProfileManager, "findByPk").mockResolvedValue({ allowedCorridors, allowedCustomerTypes: null, isActive: true } as never);
    spyOn(ManagedProfile, "findOne").mockResolvedValue({ id: "relationship-1" } as never);
    spyOn(User, "findByPk").mockResolvedValue({ activeCustomerEntityId: "entity-1", kind: "managed" } as never);
    spyOn(CustomerEntity, "findAll").mockResolvedValue([{ id: "entity-1", status: "active", type: "individual" }] as never);
  }

  it("returns exact child limits through a manager Bearer session", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: MANAGER_ID, valid: true });
    allowManagedProfile();
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });

    const response = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR", "MX"] }),
      headers: {
        Authorization: "Bearer manager-token",
        "Content-Type": "application/json",
        "X-Managed-Profile-Id": CHILD_ID
      },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(getUserLimits).toHaveBeenCalledWith(CHILD_ID, ["BR", "MX"]);
  });

  it("accepts a manager secret for child limits and rejects a disallowed requested corridor", async () => {
    spyOn(apiKeyAuthHelpers, "validateSecretApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "secret"
      },
      partner: null
    });
    allowManagedProfile(["BR"]);
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });

    const allowedResponse = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR"] }),
      headers: { "Content-Type": "application/json", "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID },
      method: "POST"
    });
    const deniedResponse = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR", "MX"] }),
      headers: { "Content-Type": "application/json", "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID },
      method: "POST"
    });

    expect(allowedResponse.status).toBe(200);
    expect(deniedResponse.status).toBe(403);
    expect(getUserLimits).toHaveBeenCalledTimes(1);
    expect(getUserLimits).toHaveBeenCalledWith(CHILD_ID, ["BR"]);
  });

  it("validates managed child limit input before corridor authorization", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: MANAGER_ID, valid: true });
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });

    const response = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR", "BR"] }),
      headers: {
        Authorization: "Bearer manager-token",
        "Content-Type": "application/json",
        "X-Managed-Profile-Id": CHILD_ID
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(getUserLimits).not.toHaveBeenCalled();
  });

  it("rejects public-key-only ramp-info delegation", async () => {
    spyOn(apiKeyAuthHelpers, "validatePublicApiKey").mockResolvedValue({
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "public"
      }
    });

    const response = await fetch(`${baseUrl}/v1/ramp-info`, {
      headers: { "X-Managed-Profile-Id": CHILD_ID, "X-Public-Key": PUBLIC_KEY }
    });

    expect(response.status).toBe(401);
  });

  it("preserves public and secret self ramp-info reads", async () => {
    const credential = {
      credentialId: "credential-1",
      environment: "test" as const,
      partnerId: null,
      profileId: MANAGER_ID
    };
    spyOn(apiKeyAuthHelpers, "validatePublicApiKey").mockResolvedValue({
      credential: { ...credential, strength: "public" }
    });
    spyOn(apiKeyAuthHelpers, "validateApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: { ...credential, strength: "secret" },
      partner: null
    });
    const getRampInfo = spyOn(rampInfoService, "getRampInfo").mockResolvedValue({ corridors: {} } as never);

    const publicResponse = await fetch(`${baseUrl}/v1/ramp-info`, { headers: { "X-Public-Key": PUBLIC_KEY } });
    const secretResponse = await fetch(`${baseUrl}/v1/ramp-info`, { headers: { "X-API-Key": SECRET_KEY } });

    expect(publicResponse.status).toBe(200);
    expect(secretResponse.status).toBe(200);
    expect(getRampInfo).toHaveBeenCalledTimes(2);
    expect(getRampInfo).toHaveBeenNthCalledWith(1, MANAGER_ID);
    expect(getRampInfo).toHaveBeenNthCalledWith(2, MANAGER_ID);
  });

  it("returns aggregate child ramp-info through a manager secret", async () => {
    spyOn(apiKeyAuthHelpers, "validateApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "secret"
      },
      partner: null
    });
    allowManagedProfile();
    const getRampInfo = spyOn(rampInfoService, "getRampInfo").mockResolvedValue({ corridors: {} } as never);

    const response = await fetch(`${baseUrl}/v1/ramp-info`, {
      headers: { "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID }
    });

    expect(response.status).toBe(200);
    expect(getRampInfo).toHaveBeenCalledWith(CHILD_ID);
  });
});
