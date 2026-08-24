import { Router } from "express";
import { getAccount, listAccounts } from "../../../controllers/admin-console/accounts.controller";
import { requireVortexAdmin } from "../../../middlewares/vortexAdminAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireVortexAdmin);

/**
 * GET /v1/admin-console/accounts
 * Paginated account list. ?search= matches email (case-insensitive, partial); ?cursor=/?limit= paginate.
 */
router.get("/", listAccounts);

/**
 * GET /v1/admin-console/accounts/:profileId
 * Full account detail: entities, provider customers, KYC cases, recent impersonation sessions.
 */
router.get("/:profileId", getAccount);

export default router;
