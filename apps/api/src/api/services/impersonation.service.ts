import crypto from "crypto";
import { literal } from "sequelize";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import AdminImpersonationSession from "../../models/adminImpersonationSession.model";
import ProfileRole from "../../models/profileRole.model";
import User from "../../models/user.model";

/** Opaque token prefix, so ordinary Supabase bearer tokens are routed without a DB hit. */
export const IMPERSONATION_TOKEN_PREFIX = "vtx_imp_";

/** Non-renewable: continuing past this requires a fresh, separately audited admin action. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

/** `last_used_at` is a liveness signal, not an access log — don't write it on every request. */
const LAST_USED_THROTTLE_MS = 60 * 1000;

/**
 * The impersonated principal, resolved once per request and carried on `req.impersonation`.
 * `targetEmail` matters: controllers such as mykobo/alfredpay/monerium key provider
 * enrolment off `req.userEmail`, which must be the target's, never the operator's.
 */
export interface ImpersonationContext {
  sessionId: string;
  actorProfileId: string;
  targetProfileId: string;
  targetEmail: string;
  expiresAt: Date;
}

export class ImpersonationDisabledError extends Error {
  constructor() {
    super("Impersonation is disabled");
  }
}

export class ImpersonationTargetError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ImpersonationActorError extends Error {
  constructor() {
    super("Actor no longer has the vortex_admin role");
  }
}

export function isImpersonationToken(token: string): boolean {
  return token.startsWith(IMPERSONATION_TOKEN_PREFIX);
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mints a session and returns the raw token exactly once — only its SHA-256 is persisted,
 * so a leaked database row cannot be replayed.
 */
export async function createSession(input: {
  actorProfileId: string;
  targetProfileId: string;
}): Promise<{ token: string; session: AdminImpersonationSession; target: User }> {
  if (!config.impersonationEnabled) {
    throw new ImpersonationDisabledError();
  }

  if (input.actorProfileId === input.targetProfileId) {
    throw new ImpersonationTargetError("An admin cannot impersonate themselves");
  }

  const token = `${IMPERSONATION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const { session, target } = await sequelize.transaction(async transaction => {
    // Serialize all session creation for one operator. Without this lock, two concurrent
    // requests can both run the revoke step before either inserts, leaving two live tokens.
    const actor = await User.findByPk(input.actorProfileId, {
      attributes: ["id"],
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!actor) {
      throw new ImpersonationTargetError("Actor profile was not found");
    }

    const [target, actorRole] = await Promise.all([
      User.findByPk(input.targetProfileId, { transaction }),
      ProfileRole.findOne({ transaction, where: { role: "vortex_admin", userId: input.actorProfileId } })
    ]);
    if (!target) {
      throw new ImpersonationTargetError("Target profile was not found");
    }
    if (!actorRole) {
      throw new ImpersonationActorError();
    }

    // One active session per (actor, target): starting a new one closes the old one, so a
    // forgotten tab can never hold rights alongside a fresh session.
    await AdminImpersonationSession.update(
      { revokedAt: new Date(), revokedReason: "superseded" },
      {
        transaction,
        where: {
          actorProfileId: input.actorProfileId,
          revokedAt: null,
          targetProfileId: input.targetProfileId
        }
      }
    );

    const session = await AdminImpersonationSession.create(
      {
        actorProfileId: input.actorProfileId,
        expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS),
        targetProfileId: input.targetProfileId,
        tokenHash: hashToken(token)
      },
      { transaction }
    );

    return { session, target };
  });

  return { session, target, token };
}

/**
 * Resolves an opaque impersonation token to its principal. Returns null for anything that
 * is not currently live — unknown, expired, revoked, or minted before the kill switch.
 */
export async function resolveSession(token: string): Promise<ImpersonationContext | null> {
  if (!config.impersonationEnabled || !isImpersonationToken(token)) {
    return null;
  }

  const session = await AdminImpersonationSession.findOne({ where: { tokenHash: hashToken(token) } });
  if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const [target, actorRole] = await Promise.all([
    User.findByPk(session.targetProfileId, { attributes: ["id", "email"] }),
    ProfileRole.findOne({ attributes: ["id"], where: { role: "vortex_admin", userId: session.actorProfileId } })
  ]);
  if (!target || !actorRole) {
    return null;
  }

  const now = Date.now();
  if (!session.lastUsedAt || now - session.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS) {
    await session.update({ lastUsedAt: new Date(now) });
  }

  return {
    actorProfileId: session.actorProfileId,
    expiresAt: session.expiresAt,
    sessionId: session.id,
    targetEmail: target.email,
    targetProfileId: session.targetProfileId
  };
}

/** Ends a session immediately. Returns false when it does not exist or was already closed. */
export async function revokeSession(sessionId: string, revokedReason: string): Promise<boolean> {
  const [updated] = await AdminImpersonationSession.update(
    { revokedAt: new Date(), revokedReason: revokedReason.slice(0, 100) },
    { where: { id: sessionId, revokedAt: null } }
  );
  return updated > 0;
}

/** Operator-facing audit view: active sessions first, then recently closed ones. */
export async function listSessions(
  input: { actorProfileId?: string; limit?: number } = {}
): Promise<AdminImpersonationSession[]> {
  const requestedLimit = input.limit ?? 50;
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 50;

  return AdminImpersonationSession.findAll({
    include: [
      { as: "actor", attributes: ["id", "email"], model: User },
      { as: "target", attributes: ["id", "email"], model: User }
    ],
    limit,
    order: [
      // Mirrors isSessionActive() in SQL so live sessions sort above closed ones.
      [
        literal(`("AdminImpersonationSession"."revoked_at" IS NULL AND "AdminImpersonationSession"."expires_at" > NOW())`),
        "DESC"
      ],
      ["createdAt", "DESC"]
    ],
    where: input.actorProfileId ? { actorProfileId: input.actorProfileId } : undefined
  });
}

/** True when the session is live right now — used to render "active" in the audit view. */
export function isSessionActive(session: AdminImpersonationSession): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > Date.now();
}
