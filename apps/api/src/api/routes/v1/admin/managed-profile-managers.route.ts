import { Router } from "express";
import {
  postManagedProfileForManager,
  putManagedProfileManager,
  readManagedProfileManager
} from "../../../controllers/admin/managedProfileManagers.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

router.post("/:profileId/managed-profiles", postManagedProfileForManager);
router.put("/:profileId", putManagedProfileManager);
router.get("/:profileId", readManagedProfileManager);

export default router;
