import { Router } from "express";
import multer from "multer";
import { AlfredpayController } from "../../controllers/alfredpay.controller";
import { validateResultCountry } from "../../middlewares/alfredpay.middleware";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router = Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.get("/alfredpayStatus", requireAuth, validateResultCountry, AlfredpayController.alfredpayStatus);
router.post("/createIndividualCustomer", requireAuth, validateResultCountry, AlfredpayController.createIndividualCustomer);
router.get("/getKycRedirectLink", requireAuth, validateResultCountry, AlfredpayController.getKycRedirectLink);
router.post("/kycRedirectOpened", requireAuth, validateResultCountry, AlfredpayController.kycRedirectOpened);
router.post("/kycRedirectFinished", requireAuth, validateResultCountry, AlfredpayController.kycRedirectFinished);
router.get("/getKycStatus", requireAuth, validateResultCountry, AlfredpayController.getKycStatus);
router.post("/retryKyc", requireAuth, validateResultCountry, AlfredpayController.retryKyc);
router.post("/createBusinessCustomer", requireAuth, validateResultCountry, AlfredpayController.createBusinessCustomer);
router.get("/getKybRedirectLink", requireAuth, validateResultCountry, AlfredpayController.getKybRedirectLink);

// MXN API-based KYC
router.post("/submitKycInformation", requireAuth, validateResultCountry, AlfredpayController.submitKycInformation);
router.post("/submitKycFile", requireAuth, upload.single("file"), validateResultCountry, AlfredpayController.submitKycFile);
router.post("/sendKycSubmission", requireAuth, validateResultCountry, AlfredpayController.sendKycSubmission);

// Fiat accounts (USD + MXN)
router.post("/fiatAccounts", requireAuth, validateResultCountry, AlfredpayController.addFiatAccount);
router.get("/fiatAccounts", requireAuth, validateResultCountry, AlfredpayController.listFiatAccounts);
router.delete("/fiatAccounts/:fiatAccountId", requireAuth, validateResultCountry, AlfredpayController.deleteFiatAccount);

export default router;
