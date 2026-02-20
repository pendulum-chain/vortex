import { Router } from "express";
import { AlfredpayController } from "../../controllers/alfredpay.controller";
import { validateResultCountry } from "../../middlewares/alfredpay.middleware";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router = Router();

router.get("/alfredpayStatus", requireAuth, validateResultCountry, AlfredpayController.alfredpayStatus);
router.post("/createCustomer", requireAuth, validateResultCountry, AlfredpayController.createCustomer);
router.get("/getKycRedirectLink", requireAuth, validateResultCountry, AlfredpayController.getKycRedirectLink);
router.post("/kycRedirectOpened", requireAuth, validateResultCountry, AlfredpayController.kycRedirectOpened);
router.post("/kycRedirectFinished", requireAuth, validateResultCountry, AlfredpayController.kycRedirectFinished);
router.get("/getKycStatus", requireAuth, validateResultCountry, AlfredpayController.getKycStatus);
router.post("/retryKyc", requireAuth, validateResultCountry, AlfredpayController.retryKyc);
router.post("/createBusinessCustomer", requireAuth, validateResultCountry, AlfredpayController.createBusinessCustomer);
router.get("/getKybRedirectLink", requireAuth, validateResultCountry, AlfredpayController.getKybRedirectLink);

export default router;
