import { Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { validataSubaccountCreation, validateStartKyc2 } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/getUser").get(brlaController.getAveniaUser);

router.route("/getUserRemainingLimit").get(brlaController.getAveniaUserRemainingLimit);

router.route("/getRampStatus").get(brlaController.getRampStatus);

router.route("/getKycStatus").get(brlaController.fetchSubaccountKycStatus);

router.route("/validatePixKey").get(brlaController.validatePixKey);

router.route("/createSubaccount").post(validataSubaccountCreation, brlaController.createSubaccount);

router.route("/getUploadUrls").post(validateStartKyc2, brlaController.getUploadUrls);

router.route("/newKyc").post(brlaController.newKyc);

export default router;
