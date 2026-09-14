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
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { rejectDirectManagedCredential } from "../../middlewares/managedProfileAuth";

const router = Router();

router.use(requirePartnerOrUserAuth());
router.use(rejectDirectManagedCredential);
router.post("/", rejectImpersonation, postManagedProfile);
router.get("/", readManagedProfiles);
router.post("/:profileId/api-credentials", rejectImpersonation, postManagedProfileApiCredential);
router.get("/:profileId/api-credentials", readManagedProfileApiCredentials);
router.delete("/:profileId/api-credentials/:credentialId", rejectImpersonation, removeManagedProfileApiCredential);
router.get("/:profileId", readManagedProfile);
router.delete("/:profileId", rejectImpersonation, removeManagedProfile);

export default router;
