import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import crypto from "crypto";
import { config } from "../../config/vars";
import AdminImpersonationSession from "../../models/adminImpersonationSession.model";
import ProfileRole from "../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import {
  createSession,
  IMPERSONATION_TOKEN_PREFIX,
  ImpersonationDisabledError,
  ImpersonationTargetError,
  listSessions,
  resolveSession,
  revokeSession
} from "./impersonation.service";

describe("impersonation.service", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.impersonationEnabled = true;
  });

  afterEach(() => {
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  afterAll(() => {
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  async function createAdmin() {
    const actor = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    return actor;
  }

  it("persists only the SHA-256 hash of the token, never the raw value", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();

    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const expectedHash = crypto.createHash("sha256").update(token).digest("hex");
    expect(session.tokenHash).toBe(expectedHash);
    expect(session.tokenHash).not.toBe(token);

    const reloaded = await AdminImpersonationSession.findByPk(session.id);
    expect(reloaded?.tokenHash).toBe(expectedHash);
  });

  it("resolves a live token to the target's principal context", async () => {
    const actor = await createAdmin();
    const target = await createTestUser({ email: "target@example.com" });

    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const resolved = await resolveSession(token);
    expect(resolved).toEqual({
      actorProfileId: actor.id,
      expiresAt: session.expiresAt,
      sessionId: session.id,
      targetEmail: target.email,
      targetProfileId: target.id
    });
  });

  it("returns null for an expired session", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    await session.update({ expiresAt: new Date(Date.now() - 1000) });

    expect(await resolveSession(token)).toBeNull();
  });

  it("returns null for a revoked session", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    await revokeSession(session.id, "manual revoke");

    expect(await resolveSession(token)).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    expect(await resolveSession(`${IMPERSONATION_TOKEN_PREFIX}unknown-token-value`)).toBeNull();
  });

  it("stops resolving a live token when the actor role is removed out-of-band", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    await ProfileRole.destroy({ where: { role: "vortex_admin", userId: actor.id } });

    expect(await resolveSession(token)).toBeNull();
  });

  it("returns null for a non-vtx_imp_ string without hitting the database", async () => {
    const findOne = spyOn(AdminImpersonationSession, "findOne");

    expect(await resolveSession("some-supabase-token")).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it("revokes the prior session with 'superseded' when a second session starts for the same actor and target", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();

    const first = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });
    const second = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const reloadedFirst = await AdminImpersonationSession.findByPk(first.session.id);
    expect(reloadedFirst?.revokedAt).not.toBeNull();
    expect(reloadedFirst?.revokedReason).toBe("superseded");

    const reloadedSecond = await AdminImpersonationSession.findByPk(second.session.id);
    expect(reloadedSecond?.revokedAt).toBeNull();
  });

  it("serializes concurrent starts so exactly one session remains live", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();

    await Promise.all([
      createSession({ actorProfileId: actor.id, targetProfileId: target.id }),
      createSession({ actorProfileId: actor.id, targetProfileId: target.id })
    ]);

    const sessions = await AdminImpersonationSession.findAll({
      order: [["createdAt", "ASC"]],
      where: { actorProfileId: actor.id, targetProfileId: target.id }
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.filter(session => session.revokedAt === null)).toHaveLength(1);
    expect(sessions.filter(session => session.revokedReason === "superseded")).toHaveLength(1);
  });

  it("rejects session creation when the actor no longer has the admin role", async () => {
    const actor = await createTestUser();
    const target = await createTestUser();

    await expect(createSession({ actorProfileId: actor.id, targetProfileId: target.id })).rejects.toThrow(
      "Actor no longer has the vortex_admin role"
    );
  });

  it("rejects an actor impersonating themselves", async () => {
    const actor = await createAdmin();

    await expect(createSession({ actorProfileId: actor.id, targetProfileId: actor.id })).rejects.toBeInstanceOf(
      ImpersonationTargetError
    );
  });

  it("rejects a non-existent target", async () => {
    const actor = await createAdmin();

    await expect(
      createSession({ actorProfileId: actor.id, targetProfileId: crypto.randomUUID() })
    ).rejects.toBeInstanceOf(ImpersonationTargetError);
  });

  it("kill switch: disables new sessions and revokes resolution of already-live tokens", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    config.impersonationEnabled = false;

    await expect(createSession({ actorProfileId: actor.id, targetProfileId: target.id })).rejects.toBeInstanceOf(
      ImpersonationDisabledError
    );
    // The previously-minted token must stop resolving the instant the flag flips, not just
    // block new sessions from being minted.
    expect(await resolveSession(token)).toBeNull();
  });

  it("writes last_used_at on first use and does not rewrite it within the throttle window", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    expect(session.lastUsedAt).toBeNull();

    await resolveSession(token);
    const afterFirstUse = await AdminImpersonationSession.findByPk(session.id);
    expect(afterFirstUse?.lastUsedAt).not.toBeNull();

    await resolveSession(token);
    const afterSecondUse = await AdminImpersonationSession.findByPk(session.id);
    expect(afterSecondUse?.lastUsedAt?.getTime()).toBe(afterFirstUse?.lastUsedAt?.getTime());
  });

  it("does not overwrite the original revoked_at when revoking an already-revoked session", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    expect(await revokeSession(session.id, "first reason")).toBe(true);
    const firstRevoke = await AdminImpersonationSession.findByPk(session.id);

    expect(await revokeSession(session.id, "second reason")).toBe(false);
    const secondRevoke = await AdminImpersonationSession.findByPk(session.id);

    expect(secondRevoke?.revokedAt?.getTime()).toBe(firstRevoke?.revokedAt?.getTime());
    expect(secondRevoke?.revokedReason).toBe("first reason");
  });

  it("retains impersonation audit rows by restricting target deletion", async () => {
    const actor = await createAdmin();
    const target = await createTestUser();
    const { session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    await expect(target.destroy()).rejects.toThrow();

    expect(await AdminImpersonationSession.findByPk(session.id)).not.toBeNull();
  });

  it("falls back to the default list limit for a negative value", async () => {
    const firstActor = await createAdmin();
    const secondActor = await createAdmin();
    const firstTarget = await createTestUser();
    const secondTarget = await createTestUser();
    await createSession({ actorProfileId: firstActor.id, targetProfileId: firstTarget.id });
    await createSession({ actorProfileId: secondActor.id, targetProfileId: secondTarget.id });

    expect(await listSessions({ limit: -1 })).toHaveLength(2);
  });

  it("lists active sessions before closed ones even when a closed one was created more recently", async () => {
    const liveActor = await createAdmin();
    const liveTarget = await createTestUser();
    const { session: live } = await createSession({ actorProfileId: liveActor.id, targetProfileId: liveTarget.id });

    // Distinct parties, so this does not supersede the session above. Created second, so it
    // outranks `live` on createdAt alone — the ordering must still put the active one first.
    const closedActor = await createAdmin();
    const closedTarget = await createTestUser();
    const { session: closed } = await createSession({ actorProfileId: closedActor.id, targetProfileId: closedTarget.id });
    await revokeSession(closed.id, "revoked_by_admin");

    expect(closed.createdAt.getTime()).toBeGreaterThanOrEqual(live.createdAt.getTime());

    const listed = await listSessions();
    expect(listed.map(session => session.id)).toEqual([live.id, closed.id]);
  });

  it("lists expired sessions after live ones", async () => {
    const liveActor = await createAdmin();
    const liveTarget = await createTestUser();
    const { session: live } = await createSession({ actorProfileId: liveActor.id, targetProfileId: liveTarget.id });

    const expiredActor = await createAdmin();
    const expiredTarget = await createTestUser();
    const { session: expired } = await createSession({
      actorProfileId: expiredActor.id,
      targetProfileId: expiredTarget.id
    });
    await expired.update({ expiresAt: new Date(Date.now() - 1000) });

    const listed = await listSessions();
    expect(listed.map(session => session.id)).toEqual([live.id, expired.id]);
  });
});
