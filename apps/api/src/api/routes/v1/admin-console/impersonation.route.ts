import { Router } from "express";
import {
  createImpersonationSession,
  deleteImpersonationSession,
  listImpersonationSessions
} from "../../../controllers/admin-console/impersonation.controller";
import { requireAuth } from "../../../middlewares/supabaseAuth";
import { requireVortexAdmin } from "../../../middlewares/vortexAdminAuth";

const router: Router = Router({ mergeParams: true });

/**
 * POST /v1/admin-console/impersonation
 * Starts an impersonation session. Body: { targetProfileId }.
 */
router.post("/", requireVortexAdmin, createImpersonationSession);

/**
 * GET /v1/admin-console/impersonation
 * Active + recent impersonation sessions (audit view).
 */
router.get("/", requireVortexAdmin, listImpersonationSessions);

/**
 * DELETE /v1/admin-console/impersonation/:sessionId
 * Ends a session. Not behind `requireVortexAdmin`: an impersonated caller must be able to
 * end its OWN session (the dashboard's "Exit impersonation" action) without holding
 * vortex_admin itself. Authorization for every other case is enforced inside the
 * controller, which still requires vortex_admin to revoke anyone else's session.
 */
router.delete("/:sessionId", requireAuth, deleteImpersonationSession);

export default router;
