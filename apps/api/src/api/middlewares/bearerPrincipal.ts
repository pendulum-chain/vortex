import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { SupabaseAuthService } from "../services/auth";
import { type ImpersonationContext, isImpersonationToken, resolveSession } from "../services/impersonation.service";

export type { ImpersonationContext };

/**
 * The principal a bearer token resolves to. An impersonation token resolves to the
 * *target* profile — everything downstream (`getEffectiveUserId`, `ownershipAuth`,
 * controllers) then scopes to the target with no further changes.
 */
export type BearerPrincipal =
  | { valid: true; userId: string; userEmail?: string; impersonation?: ImpersonationContext }
  | { valid: false };

/**
 * Single entry point for turning a bearer token into a principal. Routes on the
 * `vtx_imp_` prefix so ordinary Supabase tokens keep exactly their current path and cost.
 */
export async function resolveBearerPrincipal(token: string): Promise<BearerPrincipal> {
  if (isImpersonationToken(token)) {
    const impersonation = await resolveSession(token);
    if (!impersonation) {
      return { valid: false };
    }
    return {
      impersonation,
      userEmail: impersonation.targetEmail,
      userId: impersonation.targetProfileId,
      valid: true
    };
  }

  const result = await SupabaseAuthService.verifyToken(token);
  if (!result.valid || !result.user_id) {
    return { valid: false };
  }
  return { userEmail: result.email, userId: result.user_id, valid: true };
}

/**
 * Refuses routes that an impersonated caller must never reach: minting API credentials
 * (which would outlive the session and become a permanent backdoor) and the admin console
 * itself (no privilege re-escalation, no impersonation chaining).
 */
export function rejectImpersonation(req: Request, res: Response, next: NextFunction): void {
  if (req.impersonation) {
    impersonationNotAllowedResponse(res);
    return;
  }
  next();
}

/** Shared with the routes that gate on impersonation inline instead of via the middleware. */
export function impersonationNotAllowedResponse(res: Response): void {
  res.status(httpStatus.FORBIDDEN).json({
    error: {
      code: "IMPERSONATION_NOT_ALLOWED",
      message: "This action is not available while acting as another account.",
      status: httpStatus.FORBIDDEN
    }
  });
}
