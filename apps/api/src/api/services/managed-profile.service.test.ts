import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import express from "express";
import { supabaseAdmin } from "../../config/supabase";
import CustomerEntity from "../../models/customerEntity.model";
import PartnerManagedProfile from "../../models/partnerManagedProfile.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestPartner } from "../../test-utils/factories";
import managedProfilesRoutes from "../routes/v1/admin/managed-profiles.route";
import authRoutes from "../routes/v1/auth.route";
import { SupabaseAuthService } from "./auth";

const BASE_PATH = "/v1/admin/managed-profiles";
const ADMIN_HEADERS = { Authorization: "Bearer test-admin-secret", "Content-Type": "application/json" };

describe("managed profile creation", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;
  const authUsers = new Map<string, SupabaseUser>();
  const originalCreateUser = supabaseAdmin.auth.admin.createUser;
  const originalListUsers = supabaseAdmin.auth.admin.listUsers;
  const originalVerifyOtp = SupabaseAuthService.verifyOTP;
  const createUserMock = mock(async (attributes: { app_metadata?: Record<string, unknown>; email?: string }) => {
    const email = attributes.email!;
    if (authUsers.has(email)) {
      return { data: { user: null }, error: { code: "email_exists", message: "User already registered" } } as never;
    }
    const user = {
      app_metadata: attributes.app_metadata ?? {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email,
      id: crypto.randomUUID(),
      user_metadata: {}
    } as SupabaseUser;
    authUsers.set(email, user);
    return { data: { user }, error: null } as never;
  });
  const listUsersMock = mock(async () => ({ data: { users: [...authUsers.values()] }, error: null }) as never);

  beforeAll(async () => {
    await setupTestDatabase();
    supabaseAdmin.auth.admin.createUser = createUserMock as typeof supabaseAdmin.auth.admin.createUser;
    supabaseAdmin.auth.admin.listUsers = listUsersMock as typeof supabaseAdmin.auth.admin.listUsers;

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, managedProfilesRoutes);
    app.use("/v1/auth", authRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => {
    supabaseAdmin.auth.admin.createUser = originalCreateUser;
    supabaseAdmin.auth.admin.listUsers = originalListUsers;
    SupabaseAuthService.verifyOTP = originalVerifyOtp;
    server?.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    authUsers.clear();
    createUserMock.mockClear();
    listUsersMock.mockClear();
    SupabaseAuthService.verifyOTP = originalVerifyOtp;
  });

  function post(body: unknown, headers: Record<string, string> = ADMIN_HEADERS) {
    return fetch(baseUrl, { body: JSON.stringify(body), headers, method: "POST" });
  }

  it("requires admin auth and creates an idempotent normalized individual profile", async () => {
    const partner = await createTestPartner();
    const input = {
      email: "  Managed.User@Example.COM ",
      externalUserId: "customer-1",
      partnerId: partner.id,
      subjectType: "individual"
    };

    expect((await post(input, { "Content-Type": "application/json" })).status).toBe(401);
    const created = await post(input);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { managedProfile: { email: string; profileId: string } };
    expect(body.managedProfile.email).toBe("managed.user@example.com");
    expect(await CustomerEntity.count({ where: { profileId: body.managedProfile.profileId, type: "individual" } })).toBe(1);

    const retried = await post({ ...input, email: "MANAGED.USER@example.com" });
    expect(retried.status).toBe(200);
    expect(createUserMock).toHaveBeenCalledTimes(1);
    expect(await PartnerManagedProfile.count()).toBe(1);
  });

  it("conflicts for a changed email or for the same email under another external ID", async () => {
    const partner = await createTestPartner();
    const base = { email: "owner@example.com", externalUserId: "customer-1", partnerId: partner.id, subjectType: "business" };
    expect((await post(base)).status).toBe(201);

    expect((await post({ ...base, email: "other@example.com" })).status).toBe(409);
    expect((await post({ ...base, externalUserId: "customer-2" })).status).toBe(409);
    expect(await PartnerManagedProfile.count()).toBe(1);
  });

  it("reconciles only an Auth identity carrying the exact workflow metadata", async () => {
    const partner = await createTestPartner();
    const email = "retry@example.com";
    const exactUser = {
      app_metadata: {
        vortex_managed_profile_external_user_id: "retry-1",
        vortex_managed_profile_partner_id: partner.id
      },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email,
      id: crypto.randomUUID(),
      user_metadata: {}
    } as SupabaseUser;
    authUsers.set(email, exactUser);

    const recovered = await post({ email, externalUserId: "retry-1", partnerId: partner.id, subjectType: "individual" });
    expect(recovered.status).toBe(201);
    expect((await PartnerManagedProfile.findOne({ where: { externalUserId: "retry-1" } }))?.profileId).toBe(exactUser.id);

    const foreignEmail = "foreign@example.com";
    authUsers.set(foreignEmail, { ...exactUser, email: foreignEmail, id: crypto.randomUUID(), app_metadata: {} });
    const rejected = await post({ email: foreignEmail, externalUserId: "retry-2", partnerId: partner.id, subjectType: "individual" });
    expect(rejected.status).toBe(409);
  });

  it("reports non-duplicate Auth failures without scanning users", async () => {
    const partner = await createTestPartner();
    createUserMock.mockImplementationOnce(
      async () => ({ data: { user: null }, error: { code: "over_request_rate_limit", message: "Rate limit exceeded" } }) as never
    );

    const response = await post({
      email: "rate-limited@example.com",
      externalUserId: "rate-limited-1",
      partnerId: partner.id,
      subjectType: "individual"
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "MANAGED_PROFILE_UPSTREAM_ERROR",
        message: "Could not create the Auth identity",
        status: 502
      }
    });
    expect(listUsersMock).not.toHaveBeenCalled();
    expect(await PartnerManagedProfile.count()).toBe(0);
  });

  it("creates no entity for technical profiles and marks claims after OTP verification by profile UUID", async () => {
    const partner = await createTestPartner();
    const response = await post({
      email: "technical@example.com",
      externalUserId: "machine-1",
      partnerId: partner.id,
      subjectType: "technical"
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { managedProfile: { profileId: string } };
    expect(await CustomerEntity.count({ where: { profileId: body.managedProfile.profileId } })).toBe(0);

    SupabaseAuthService.verifyOTP = mock(async () => ({
      access_token: "access",
      refresh_token: "refresh",
      user_id: body.managedProfile.profileId
    }));
    const verified = await fetch(`${baseUrl.replace(BASE_PATH, "")}/v1/auth/verify-otp`, {
      body: JSON.stringify({ email: "technical@example.com", token: "123456" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(verified.status).toBe(200);
    expect((await PartnerManagedProfile.findOne({ where: { profileId: body.managedProfile.profileId } }))?.claimedAt).toBeInstanceOf(
      Date
    );
    expect(await CustomerEntity.count({ where: { profileId: body.managedProfile.profileId } })).toBe(0);
  });
});
