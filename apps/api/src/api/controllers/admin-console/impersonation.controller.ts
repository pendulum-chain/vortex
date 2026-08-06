import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import AdminImpersonationSession from "../../../models/adminImpersonationSession.model";
import User from "../../../models/user.model";
import { impersonationNotAllowedResponse } from "../../middlewares/bearerPrincipal";
import { hasVortexAdminRole, vortexAdminRequiredResponse } from "../../middlewares/vortexAdminAuth";
import { buildApiClientRequestMetadata, observeApiClientEvent } from "../../observability/apiClientEvent.service";
import { getRequestDurationMs } from "../../observability/requestContext";
import {
  createSession,
  ImpersonationDisabledError,
  ImpersonationTargetError,
  isSessionActive,
  listSessions,
  revokeSession
} from "../../services/impersonation.service";

/**
 * POST /v1/admin-console/impersonation
 * Mints an impersonation session for the calling vortex_admin. `req.userId` is that operator:
 * `requireVortexAdmin` has already run `rejectImpersonation` (so no impersonation context can
 * be in play) and confirmed the role. The raw token is returned exactly once.
 */
export async function createImpersonationSession(req: Request, res: Response): Promise<void> {
  const actorProfileId = req.userId as string;
  const { targetProfileId } = req.body ?? {};

  if (typeof targetProfileId !== "string" || !targetProfileId) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: { code: "INVALID_IMPERSONATION_INPUT", message: "targetProfileId is required", status: httpStatus.BAD_REQUEST }
    });
    return;
  }

  try {
    const { token, session, target } = await createSession({
      actorProfileId,
      targetProfileId
    });

    observeApiClientEvent({
      durationMs: getRequestDurationMs(req),
      httpStatus: httpStatus.CREATED,
      metadata: { ...buildApiClientRequestMetadata(req, {}), actorProfileId, targetProfileId },
      operation: "admin_impersonation_start",
      requestId: req.requestId,
      status: "success",
      userId: actorProfileId
    });

    res.status(httpStatus.CREATED).json({
      expiresAt: session.expiresAt,
      sessionId: session.id,
      target: { email: target.email, id: target.id },
      token
    });
  } catch (error) {
    if (error instanceof ImpersonationDisabledError) {
      observeApiClientEvent({
        durationMs: getRequestDurationMs(req),
        errorType: "service_unavailable",
        httpStatus: httpStatus.SERVICE_UNAVAILABLE,
        metadata: { ...buildApiClientRequestMetadata(req, {}), actorProfileId, targetProfileId },
        operation: "admin_impersonation_start",
        requestId: req.requestId,
        status: "failure",
        userId: actorProfileId
      });
      res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        error: { code: "IMPERSONATION_DISABLED", message: error.message, status: httpStatus.SERVICE_UNAVAILABLE }
      });
      return;
    }
    if (error instanceof ImpersonationTargetError) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: { code: "IMPERSONATION_TARGET_INVALID", message: error.message, status: httpStatus.BAD_REQUEST }
      });
      return;
    }

    logger.error("Error creating impersonation session:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create impersonation session",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

/**
 * GET /v1/admin-console/impersonation
 * Active + recent sessions, audit-view style.
 */
export async function listImpersonationSessions(req: Request, res: Response): Promise<void> {
  try {
    const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
    const sessions = await listSessions({ limit: Number.isFinite(limit) ? limit : undefined });

    res.status(httpStatus.OK).json({
      sessions: sessions.map(session => {
        const withParties = session as AdminImpersonationSession & { actor?: User; target?: User };
        return {
          active: isSessionActive(session),
          actor: withParties.actor
            ? { email: withParties.actor.email, id: withParties.actor.id }
            : { email: null, id: session.actorProfileId },
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          id: session.id,
          revokedAt: session.revokedAt,
          revokedReason: session.revokedReason,
          target: withParties.target
            ? { email: withParties.target.email, id: withParties.target.id }
            : { email: null, id: session.targetProfileId }
        };
      })
    });
  } catch (error) {
    logger.error("Error listing impersonation sessions:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list impersonation sessions",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

/**
 * DELETE /v1/admin-console/impersonation/:sessionId
 * Ends a session. A non-impersonated vortex_admin may revoke any session. An impersonated
 * caller may revoke ONLY its own active session (`req.impersonation.sessionId`) — the
 * dashboard's "Exit impersonation" action — and cannot reach or revoke any other session.
 */
export async function deleteImpersonationSession(req: Request<{ sessionId: string }>, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    const isSelfRevoke = req.impersonation?.sessionId === sessionId;

    if (!isSelfRevoke) {
      if (req.impersonation) {
        impersonationNotAllowedResponse(res);
        return;
      }
      if (!req.userId || !(await hasVortexAdminRole(req.userId))) {
        vortexAdminRequiredResponse(res);
        return;
      }
    }

    const session = await AdminImpersonationSession.findByPk(sessionId);
    const revoked = session ? await revokeSession(sessionId, isSelfRevoke ? "ended_by_target" : "revoked_by_admin") : false;

    if (!revoked || !session) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "IMPERSONATION_SESSION_NOT_FOUND",
          message: "Impersonation session was not found or already ended",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    observeApiClientEvent({
      durationMs: getRequestDurationMs(req),
      httpStatus: httpStatus.NO_CONTENT,
      metadata: {
        ...buildApiClientRequestMetadata(req, {}),
        actorProfileId: session.actorProfileId,
        targetProfileId: session.targetProfileId
      },
      operation: "admin_impersonation_end",
      requestId: req.requestId,
      status: "success",
      userId: req.userId ?? null
    });

    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error ending impersonation session:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to end impersonation session",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
