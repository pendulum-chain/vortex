import { Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { optionalAuth, requireAuth } from "../../middlewares/supabaseAuth";
import { validateStartKyc2, validateSubaccountCreation } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/getUser").get(brlaController.getAveniaUser);

router.route("/getUserRemainingLimit").get(brlaController.getAveniaUserRemainingLimit);

router.route("/getKycStatus").get(brlaController.fetchSubaccountKycStatus);

router.route("/getSelfieLivenessUrl").get(brlaController.getSelfieLivenessUrl);

router.route("/validatePixKey").get(brlaController.validatePixKey);

router.route("/createSubaccount").post(validateSubaccountCreation, optionalAuth, brlaController.createSubaccount);

router.route("/getUploadUrls").post(validateStartKyc2, optionalAuth, brlaController.getUploadUrls);

router.route("/newKyc").post(optionalAuth, brlaController.newKyc);

router.route("/kyb/new-level-1/web-sdk").post(optionalAuth, brlaController.initiateKybLevel1);

router.route("/kyb/attempt-status").get(brlaController.getKybAttemptStatus);

router.route("/kyc/record-attempt").post(requireAuth, brlaController.recordInitialKycAttempt);

export default router;
