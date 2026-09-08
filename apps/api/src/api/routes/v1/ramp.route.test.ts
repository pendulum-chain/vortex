import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import { connect } from "node:net";
import { config } from "../../../config/vars";
import ProfileRole from "../../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { installFakeSupabaseAuth, testUserToken } from "../../../test-utils/fake-world/fake-auth";
import { createTestUser } from "../../../test-utils/factories";
import { handler as errorHandler } from "../../middlewares/error";
import { createSession } from "../../services/impersonation.service";
import { createManagedProfile } from "../../services/managed-profile-lifecycle.service";
import { configureManagedProfileManager } from "../../services/managed-profile-manager.service";
import quoteRoutes from "./quote.route";
import rampRoutes, { managedProfileRampBearerRoutes } from "./ramp.route";

describe("ramp routes under impersonation", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;
  let auth: { restore: () => void };
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();

    const app = express();
    app.use("/v1/ramp", managedProfileRampBearerRoutes);
    app.use(express.json());
    app.use("/v1/quotes", quoteRoutes);
    app.use("/v1/ramp", rampRoutes);
    app.use(errorHandler);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(() => {
    server?.close();
    auth?.restore();
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.impersonationEnabled = true;
  });

  async function impersonationHeaders(): Promise<Record<string, string>> {
    const actor = await createTestUser();
    const target = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  it("rejects ramp registration, update, and start while impersonating", async () => {
    const headers = await impersonationHeaders();

    for (const path of ["register", "update", "start"]) {
      const response = await fetch(`${baseUrl}/ramp/${path}`, {
        body: JSON.stringify({}),
        headers,
        method: "POST"
      });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("IMPERSONATION_NOT_ALLOWED");
    }
  });

  it("rejects selected-child ramp registration, update, and start for a normal Supabase bearer", async () => {
    const manager = await createTestUser();
    await configureManagedProfileManager({ allowedCorridors: ["BR"], allowedCustomerTypes: null, isActive: true, profileId: manager.id });
    const { managedProfile } = await createManagedProfile({
      contactEmail: "bearer-ramp-child@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "bearer-ramp-child",
      managerProfileId: manager.id
    });
    const headers = {
      Authorization: `Bearer ${testUserToken(manager.id, manager.email)}`,
      "Content-Type": "application/json",
      "X-Managed-Profile-Id": managedProfile.profileId
    };

    for (const path of ["register", "update", "start"]) {
      const response = await fetch(`${baseUrl}/ramp/${path}`, { body: JSON.stringify({}), headers, method: "POST" });
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL");
    }
  });

  it("rejects selected-child Supabase ramp requests without draining the body", async () => {
    const manager = await createTestUser();
    await configureManagedProfileManager({ allowedCorridors: ["BR"], allowedCustomerTypes: null, isActive: true, profileId: manager.id });
    const { managedProfile } = await createManagedProfile({
      contactEmail: "undrained-bearer-ramp-child@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "undrained-bearer-ramp-child",
      managerProfileId: manager.id
    });
    const headers = {
      Authorization: `Bearer ${testUserToken(manager.id, manager.email)}`,
      "Content-Length": "1048576",
      "Content-Type": "application/json",
      "X-Managed-Profile-Id": managedProfile.profileId
    };

    for (const path of ["register", "update", "start"]) {
      const response = await postPartialBody(`${baseUrl}/ramp/${path}`, headers);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { code: "MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL" } });
      const emptyKeyResponse = await postPartialBody(`${baseUrl}/ramp/${path}`, { ...headers, "X-API-Key": "" });
      expect(emptyKeyResponse.status).toBe(403);
      expect(emptyKeyResponse.body).toMatchObject({ error: { code: "MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL" } });
    }
  });

  it("still allows quote requests to reach normal validation while impersonating", async () => {
    const headers = await impersonationHeaders();

    const response = await fetch(`${baseUrl}/quotes`, {
      body: JSON.stringify({}),
      headers,
      method: "POST"
    });

    expect(response.status).toBe(400);
  });

  it("still allows an impersonated caller to inspect ramp history", async () => {
    const headers = await impersonationHeaders();

    const response = await fetch(`${baseUrl}/ramp/history`, { headers });

    expect(response.status).toBe(200);
  });
});

function postPartialBody(url: string, headers: Record<string, string>): Promise<{ body: unknown; status: number }> {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    let response = "";
    let settled = false;
    const socket = connect(Number(requestUrl.port), requestUrl.hostname, () => {
      const requestHeaders = { ...headers, Connection: "close", Host: requestUrl.host };
      socket.write(
        `POST ${requestUrl.pathname} HTTP/1.1\r\n${Object.entries(requestHeaders)
          .map(([name, value]) => `${name}: ${value}`)
          .join("\r\n")}\r\n\r\n{`
      );
    });
    socket.setEncoding("utf8");
    socket.setTimeout(4_000, () => {
      socket.destroy();
      reject(new Error("Server waited for the incomplete request body"));
    });
    socket.on("data", chunk => {
      response += chunk;
    });
    socket.on("end", () => {
      settled = true;
      const [head, body = ""] = response.split("\r\n\r\n", 2);
      const status = Number(head?.split(" ")[1] ?? 0);
      resolve({ body: JSON.parse(body), status });
    });
    socket.on("error", error => {
      if (!settled) reject(error);
    });
  });
}
