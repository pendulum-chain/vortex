import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import { connect } from "node:net";
import CustomerEntity from "../../../models/customerEntity.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import ManagedProfileMembership from "../../../models/managedProfileMembership.model";
import User from "../../../models/user.model";
import { handler as errorHandler } from "../../middlewares/error";
import { SupabaseAuthService } from "../../services/auth";
import { managedProfileRampBearerRoutes } from "./ramp.route";

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";

describe("selected-child ramp bearer pre-parser guard", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(() => {
    const app = express();
    app.use("/v1/ramp", managedProfileRampBearerRoutes);
    app.use(express.json());
    app.use((_req, res) => res.status(418).json({ reachedParsedRoutes: true }));
    app.use(errorHandler);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => mock.restore());
  afterAll(() => server.close());

  it("denies register, update, and start without waiting for the request body", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: MEMBER_ID, valid: true });
    spyOn(ManagedProfileMembership, "findOne").mockResolvedValue({ id: "membership-1", role: "manager" } as never);
    spyOn(ManagedProfile, "findOne").mockResolvedValue({ id: "relationship-1", managerProfileId: OWNER_ID } as never);
    spyOn(ManagedProfileManager, "findByPk").mockResolvedValue({ isActive: true } as never);
    spyOn(User, "findByPk").mockResolvedValue({ activeCustomerEntityId: "entity-1", kind: "managed" } as never);
    spyOn(CustomerEntity, "findAll").mockResolvedValue([
      { id: "entity-1", status: "active", type: "individual" }
    ] as never);
    const headers = {
      Authorization: "Bearer valid-token",
      "Content-Length": "1048576",
      "Content-Type": "application/json",
      "X-Managed-Profile-Id": CHILD_ID
    };

    for (const path of ["register", "update", "start"]) {
      const response = await postPartialBody(`${baseUrl}/v1/ramp/${path}`, headers);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { code: "MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL" } });
    }
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
