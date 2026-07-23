import { Router } from "express";
import { addProfileRole, removeProfileRole } from "../../../controllers/admin/profileRoles.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

/**
 * POST /v1/admin/profile-roles
 * Grant a role to a profile (idempotent). Body: { userId, role }.
 */
router.post("/", addProfileRole);

/**
 * DELETE /v1/admin/profile-roles/:userId/:role
 * Revoke a role from a profile.
 */
router.delete("/:userId/:role", removeProfileRole);

export default router;
