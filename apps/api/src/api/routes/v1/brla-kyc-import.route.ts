import bodyParser from "body-parser";
import { RequestHandler, Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { requirePartnerOrUserAuth, requireProfileBoundPrincipal } from "../../middlewares/dualAuth";
import { authorizeManagedProfile, rejectDirectManagedCredential } from "../../middlewares/managedProfileAuth";
import { validateAveniaKycTokenImport } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.post(
  "/",
  requirePartnerOrUserAuth(),
  requireProfileBoundPrincipal,
  rejectDirectManagedCredential,
  authorizeManagedProfile({ corridor: "BR", customerType: "individual" }),
  bodyParser.json({ limit: "16kb" }),
  validateAveniaKycTokenImport,
  brlaController.importKycToken as unknown as RequestHandler
);

export default router;
