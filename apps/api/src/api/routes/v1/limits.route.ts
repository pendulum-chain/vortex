import { RequestHandler, Router } from "express";
import { getLimits, validateLimitsRequest } from "../../controllers/limits.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile, ManagedProfileCapability } from "../../middlewares/managedProfileAuth";
import { getManagedProfileLimitsCorridors } from "../../middlewares/managedProfileCorridor";

const router: Router = Router({ mergeParams: true });

router.post(
  "/",
  requirePartnerOrUserAuth(),
  validateLimitsRequest,
  authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: getManagedProfileLimitsCorridors }),
  getLimits as unknown as RequestHandler
);

export default router;
