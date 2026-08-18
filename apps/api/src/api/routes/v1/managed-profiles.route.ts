import { Router } from "express";
import {
  postManagedProfile,
  postManagedProfileApiCredential,
  readManagedProfile,
  readManagedProfileApiCredentials,
  readManagedProfiles,
  removeManagedProfile,
  removeManagedProfileApiCredential
} from "../../controllers/managedProfiles.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { rejectDirectManagedCredential } from "../../middlewares/managedProfileAuth";

const router = Router();

router.use(requirePartnerOrUserAuth());
router.use(rejectDirectManagedCredential);
router.post("/", postManagedProfile);
router.get("/", readManagedProfiles);
router.post("/:profileId/api-credentials", postManagedProfileApiCredential);
router.get("/:profileId/api-credentials", readManagedProfileApiCredentials);
router.delete("/:profileId/api-credentials/:credentialId", removeManagedProfileApiCredential);
router.get("/:profileId", readManagedProfile);
router.delete("/:profileId", removeManagedProfile);

export default router;
