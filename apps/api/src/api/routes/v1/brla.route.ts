import { Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { validataSubaccountCreation, validateStartKyc2 } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/getUser").get(brlaController.getBrlaUser);

router.route("/getUserRemainingLimit").get(brlaController.getBrlaUserRemainingLimit);

router.route("/getRampStatus").get(brlaController.getRampStatus);

router.route("/getKycStatus").get(brlaController.fetchSubaccountKycStatus);

router.route("/validatePixKey").get(brlaController.validatePixKey);

router.route("/createSubaccount").post(validataSubaccountCreation, brlaController.createSubaccount);

router.route("/startKYC2").post(validateStartKyc2, brlaController.startKYC2);

router.route("/newKyc").post(brlaController.newKyc);

export default router;
