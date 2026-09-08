import bodyParser from "body-parser";
import { RequestHandler, Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { requirePartnerOrUserAuth, requireProfileBoundPrincipal } from "../../middlewares/dualAuth";
import {
  authorizeManagedProfile,
  ManagedProfileCapability,
  rejectDirectManagedCredential
} from "../../middlewares/managedProfileAuth";
import { validateAveniaKycTokenImport } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.post(
  "/",
  requirePartnerOrUserAuth(),
  requireProfileBoundPrincipal,
  rejectDirectManagedCredential,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: "BR",
    customerType: "individual"
  }),
  rejectImpersonation,
  bodyParser.json({ limit: "16kb" }),
  validateAveniaKycTokenImport,
  brlaController.importKycToken as unknown as RequestHandler
);

export default router;
