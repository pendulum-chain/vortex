import { RequestHandler, Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { optionalAuth, requireAuth } from "../../middlewares/supabaseAuth";
import { validateStartKyc2, validateSubaccountCreation } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

// Controllers use typed Request generics (e.g. Request<unknown, unknown, unknown, BrlaGetUserRequest>)
// which don't extend Express's ParsedQs. Double-cast via unknown is the standard Express pattern
// for combining middleware with narrowly-typed handlers. Runtime query validation is in each controller.
router.get("/getUser", requirePartnerOrUserAuth(), brlaController.getAveniaUser as unknown as RequestHandler);

router.get(
  "/getUserRemainingLimit",
  requirePartnerOrUserAuth(),
  brlaController.getAveniaUserRemainingLimit as unknown as RequestHandler
);

router.get("/getKycStatus", requireAuth, brlaController.fetchSubaccountKycStatus as unknown as RequestHandler);

router.get("/getSelfieLivenessUrl", requireAuth, brlaController.getSelfieLivenessUrl as unknown as RequestHandler);

router.get("/validatePixKey", requirePartnerOrUserAuth(), brlaController.validatePixKey as unknown as RequestHandler);

router.route("/createSubaccount").post(validateSubaccountCreation, optionalAuth, brlaController.createSubaccount);

router.route("/getUploadUrls").post(validateStartKyc2, optionalAuth, brlaController.getUploadUrls);

router.route("/newKyc").post(optionalAuth, brlaController.newKyc);

router.route("/kyb/new-level-1/web-sdk").post(optionalAuth, brlaController.initiateKybLevel1);

router.route("/kyb/attempt-status").get(requireAuth, brlaController.getKybAttemptStatus);

router.route("/kyc/record-attempt").post(requireAuth, brlaController.recordInitialKycAttempt);

export default router;
