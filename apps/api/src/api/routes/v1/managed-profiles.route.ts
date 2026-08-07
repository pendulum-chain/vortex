import { Router } from "express";
import {
  postManagedProfile,
  readManagedProfile,
  readManagedProfiles,
  removeManagedProfile
} from "../../controllers/managedProfiles.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";

const router = Router();

router.use(requirePartnerOrUserAuth());
router.post("/", postManagedProfile);
router.get("/", readManagedProfiles);
router.get("/:profileId", readManagedProfile);
router.delete("/:profileId", removeManagedProfile);

export default router;
