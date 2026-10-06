import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import ProfileRole from "../../models/profileRole.model";
import { sendError } from "../helpers/sendError";
import { rejectImpersonation } from "./bearerPrincipal";
import { requireAuth } from "./supabaseAuth";

/** True when the profile holds the vortex_admin capability role. */
export async function hasVortexAdminRole(userId: string): Promise<boolean> {
  return (await ProfileRole.findOne({ where: { role: "vortex_admin", userId } })) !== null;
}

/** Shared with the routes that gate on the role inline instead of via `requireVortexAdmin`. */
export function vortexAdminRequiredResponse(res: Response): void {
  sendError(res, httpStatus.FORBIDDEN, "VORTEX_ADMIN_REQUIRED", "The vortex_admin role is required for this action.");
}

async function checkVortexAdminRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId || !(await hasVortexAdminRole(req.userId))) {
    vortexAdminRequiredResponse(res);
    return;
  }

  next();
}

/**
 * Full guard for the /v1/admin-console surface: Supabase auth, then no impersonation
 * chaining (no privilege re-escalation), then the vortex_admin capability role.
 */
export const requireVortexAdmin = [requireAuth, rejectImpersonation, checkVortexAdminRole];
