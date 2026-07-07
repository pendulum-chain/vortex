import { Router } from "express";
import multer from "multer";
import { AlfredpayController } from "../../controllers/alfredpay.controller";
import { validateResultCountry } from "../../middlewares/alfredpay.middleware";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { requireAuth } from "../../middlewares/supabaseAuth";
import { validateKycSubmission } from "../../middlewares/validators";

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

// MXN/CO API-based KYC
router.post(
  "/submitKycInformation",
  requireAuth,
  validateResultCountry,
  validateKycSubmission,
  AlfredpayController.submitKycInformation
);
router.post("/submitKycFile", requireAuth, upload.single("file"), validateResultCountry, AlfredpayController.submitKycFile);
router.post("/sendKycSubmission", requireAuth, validateResultCountry, AlfredpayController.sendKycSubmission);

// Business API-based KYB
router.post("/submitKybInformation", requireAuth, validateResultCountry, AlfredpayController.submitKybInformation);
router.post("/submitKybFile", requireAuth, upload.single("file"), validateResultCountry, AlfredpayController.submitKybFile);
router.get("/findKybCustomerAndBusiness", requireAuth, validateResultCountry, AlfredpayController.findKybCustomerAndBusiness);
router.post(
  "/submitKybRelatedPersonFile",
  requireAuth,
  upload.single("file"),
  validateResultCountry,
  AlfredpayController.submitKybRelatedPersonFile
);
router.post("/sendKybSubmission", requireAuth, validateResultCountry, AlfredpayController.sendKybSubmission);

// Fiat accounts (USD + MXN) — accept user-scoped secret API keys (sk_*) or Supabase Bearer
// via requirePartnerOrUserAuth, so SDK/server integrations can manage fiat accounts without
// a Supabase session.
router.post("/fiatAccounts", requirePartnerOrUserAuth(), validateResultCountry, AlfredpayController.addFiatAccount);
router.get("/fiatAccounts", requirePartnerOrUserAuth(), validateResultCountry, AlfredpayController.listFiatAccounts);
router.delete(
  "/fiatAccounts/:fiatAccountId",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  AlfredpayController.deleteFiatAccount
);

export default router;
