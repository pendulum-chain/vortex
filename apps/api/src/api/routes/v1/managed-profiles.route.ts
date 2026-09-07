import { Request, Router } from "express";
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
import {
  authorizeManagedProfile,
  ManagedProfileCapability,
  rejectDirectManagedCredential
} from "../../middlewares/managedProfileAuth";

const router = Router();
const pathProfileId = (req: Request): string | undefined =>
  typeof req.params.profileId === "string" ? req.params.profileId : undefined;

router.use(requirePartnerOrUserAuth());
router.use(rejectDirectManagedCredential);
router.post("/", rejectImpersonation, postManagedProfile);
router.get("/", readManagedProfiles);
router.post(
  "/:profileId/api-credentials",
  rejectImpersonation,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.Manage,
    subjectProfileId: pathProfileId
  }),
  postManagedProfileApiCredential
);
router.get(
  "/:profileId/api-credentials",
  authorizeManagedProfile({ capability: ManagedProfileCapability.Read, subjectProfileId: pathProfileId }),
  readManagedProfileApiCredentials
);
router.delete(
  "/:profileId/api-credentials/:credentialId",
  rejectImpersonation,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.Manage,
    subjectProfileId: pathProfileId
  }),
  removeManagedProfileApiCredential
);
router.get(
  "/:profileId",
  authorizeManagedProfile({
    allowDeleted: true,
    capability: ManagedProfileCapability.Read,
    membershipBootstrap: true,
    subjectProfileId: pathProfileId
  }),
  readManagedProfile
);
router.delete("/:profileId", rejectImpersonation, removeManagedProfile);

export default router;
