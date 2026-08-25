import { Router } from "express";
import { postManagedProfile } from "../../../controllers/admin/managedProfiles.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);
router.post("/", postManagedProfile);

export default router;
