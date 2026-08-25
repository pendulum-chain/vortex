import { Router } from "express";
import { addProfileRole, removeProfileRole } from "../../../controllers/admin/profileRoles.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

/**
 * POST /v1/admin/profile-roles
 * Grant a role to a profile (idempotent). Body: { userId | email, role }.
 */
router.post("/", addProfileRole);

/**
 * DELETE /v1/admin/profile-roles/:userIdOrEmail/:role
 * Revoke a role from a profile, addressed by id or email (unique on profiles).
 */
router.delete("/:userIdOrEmail/:role", removeProfileRole);

export default router;
