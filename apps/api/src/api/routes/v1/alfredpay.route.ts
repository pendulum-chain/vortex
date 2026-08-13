import { Router } from "express";
import multer from "multer";
import { AlfredpayController } from "../../controllers/alfredpay.controller";
import { validateAlfredpayCustomerType, validateResultCountry } from "../../middlewares/alfredpay.middleware";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile } from "../../middlewares/managedProfileAuth";
import {
  getManagedProfileAlfredpayCustomerType,
  getManagedProfileCountryCorridor
} from "../../middlewares/managedProfileCorridor";
import { validateKybSubmission, validateKycSubmission } from "../../middlewares/validators";

const router = Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.get(
  "/alfredpayStatus",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  validateAlfredpayCustomerType,
  authorizeManagedProfile(),
  AlfredpayController.alfredpayStatus
);
router.post(
  "/createIndividualCustomer",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "individual" }),
  AlfredpayController.createIndividualCustomer
);
router.get(
  "/getKycRedirectLink",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "individual" }),
  AlfredpayController.getKycRedirectLink
);
router.post(
  "/kycRedirectOpened",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: getManagedProfileAlfredpayCustomerType }),
  AlfredpayController.kycRedirectOpened
);
router.post(
  "/kycRedirectFinished",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: getManagedProfileAlfredpayCustomerType }),
  AlfredpayController.kycRedirectFinished
);
router.get(
  "/getKycStatus",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile(),
  AlfredpayController.getKycStatus
);
router.post(
  "/retryKyc",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: getManagedProfileAlfredpayCustomerType }),
  AlfredpayController.retryKyc
);
router.post(
  "/createBusinessCustomer",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "business" }),
  AlfredpayController.createBusinessCustomer
);
router.get(
  "/getKybRedirectLink",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "business" }),
  AlfredpayController.getKybRedirectLink
);

// MXN/CO API-based KYC
router.post(
  "/submitKycInformation",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "individual" }),
  validateKycSubmission,
  AlfredpayController.submitKycInformation
);
router.post(
  "/submitKycFile",
  requirePartnerOrUserAuth(),
  // Authenticate the relationship and immutable entity type before buffering. The country
  // corridor can only be authorized after multer exposes the multipart body.
  authorizeManagedProfile({ customerType: "individual" }),
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "individual" }),
  AlfredpayController.submitKycFile
);
router.post(
  "/sendKycSubmission",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "individual" }),
  AlfredpayController.sendKycSubmission
);

// Business API-based KYB
router.post(
  "/submitKybInformation",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "business" }),
  validateKybSubmission,
  AlfredpayController.submitKybInformation
);
router.post(
  "/submitKybFile",
  requirePartnerOrUserAuth(),
  // See submitKycFile: identity/type are pre-buffer checks; country policy is post-parse.
  authorizeManagedProfile({ customerType: "business" }),
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "business" }),
  AlfredpayController.submitKybFile
);
router.get(
  "/findKybCustomerAndBusiness",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile(),
  AlfredpayController.findKybCustomerAndBusiness
);
router.post(
  "/submitKybRelatedPersonFile",
  requirePartnerOrUserAuth(),
  // See submitKycFile: identity/type are pre-buffer checks; country policy is post-parse.
  authorizeManagedProfile({ customerType: "business" }),
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "business" }),
  AlfredpayController.submitKybRelatedPersonFile
);
router.post(
  "/sendKybSubmission",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor, customerType: "business" }),
  AlfredpayController.sendKybSubmission
);

// Fiat accounts (USD + MXN) — accept user-scoped secret API keys (sk_*) or Supabase Bearer
// via requirePartnerOrUserAuth, so SDK/server integrations can manage fiat accounts without
// a Supabase session.
router.post(
  "/fiatAccounts",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.addFiatAccount
);
router.get(
  "/fiatAccounts",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile(),
  AlfredpayController.listFiatAccounts
);
router.delete(
  "/fiatAccounts/:fiatAccountId",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.deleteFiatAccount
);

export default router;
