import { Router } from "express";
import {
  createProfilePartnerAssignment,
  listProfilePartnerAssignments,
  revokeProfilePartnerAssignment
} from "../../../controllers/admin/profilePartnerAssignments.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

/**
 * POST /v1/admin/profile-partner-assignments
 * Assign a Supabase profile to a partner name for pricing-only quote behavior.
 */
router.post("/", createProfilePartnerAssignment);

/**
 * GET /v1/admin/profile-partner-assignments
 * List active profile partner assignments by default.
 */
router.get("/", listProfilePartnerAssignments);

/**
 * DELETE /v1/admin/profile-partner-assignments/:assignmentId
 * Revoke (soft delete) a profile partner assignment.
 */
router.delete("/:assignmentId", revokeProfilePartnerAssignment);

export default router;
