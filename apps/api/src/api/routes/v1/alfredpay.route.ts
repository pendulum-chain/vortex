import { Router } from "express";
import multer from "multer";
import { AlfredpayController } from "../../controllers/alfredpay.controller";
import { validateAlfredpayCustomerType, validateResultCountry } from "../../middlewares/alfredpay.middleware";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile, ManagedProfileCapability } from "../../middlewares/managedProfileAuth";
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
  authorizeManagedProfile({ capability: ManagedProfileCapability.Read }),
  AlfredpayController.alfredpayStatus
);
router.post(
  "/createIndividualCustomer",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "individual"
  }),
  rejectImpersonation,
  AlfredpayController.createIndividualCustomer
);
router.get(
  "/getKycRedirectLink",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "individual"
  }),
  rejectImpersonation,
  AlfredpayController.getKycRedirectLink
);
router.post(
  "/kycRedirectOpened",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: getManagedProfileAlfredpayCustomerType
  }),
  rejectImpersonation,
  AlfredpayController.kycRedirectOpened
);
router.post(
  "/kycRedirectFinished",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: getManagedProfileAlfredpayCustomerType
  }),
  rejectImpersonation,
  AlfredpayController.kycRedirectFinished
);
router.get(
  "/getKycStatus",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ capability: ManagedProfileCapability.Read }),
  AlfredpayController.getKycStatus
);
router.post(
  "/retryKyc",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: getManagedProfileAlfredpayCustomerType
  }),
  rejectImpersonation,
  AlfredpayController.retryKyc
);
router.post(
  "/createBusinessCustomer",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "business"
  }),
  rejectImpersonation,
  AlfredpayController.createBusinessCustomer
);
router.get(
  "/getKybRedirectLink",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "business"
  }),
  rejectImpersonation,
  AlfredpayController.getKybRedirectLink
);

// MXN/CO API-based KYC
router.post(
  "/submitKycInformation",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "individual"
  }),
  rejectImpersonation,
  validateKycSubmission,
  AlfredpayController.submitKycInformation
);
router.post(
  "/submitKycFile",
  requirePartnerOrUserAuth(),
  // Authenticate the relationship and immutable entity type before buffering. The country
  // corridor can only be authorized after multer exposes the multipart body.
  authorizeManagedProfile({ capability: ManagedProfileCapability.CredentialManage, customerType: "individual" }),
  rejectImpersonation,
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "individual"
  }),
  AlfredpayController.submitKycFile
);
router.post(
  "/sendKycSubmission",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "individual"
  }),
  rejectImpersonation,
  AlfredpayController.sendKycSubmission
);

// Business API-based KYB
router.post(
  "/submitKybInformation",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "business"
  }),
  rejectImpersonation,
  validateKybSubmission,
  AlfredpayController.submitKybInformation
);
router.post(
  "/submitKybFile",
  requirePartnerOrUserAuth(),
  // See submitKycFile: identity/type are pre-buffer checks; country policy is post-parse.
  authorizeManagedProfile({ capability: ManagedProfileCapability.CredentialManage, customerType: "business" }),
  rejectImpersonation,
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "business"
  }),
  AlfredpayController.submitKybFile
);
router.get(
  "/findKybCustomerAndBusiness",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ capability: ManagedProfileCapability.Read }),
  AlfredpayController.findKybCustomerAndBusiness
);
router.post(
  "/submitKybRelatedPersonFile",
  requirePartnerOrUserAuth(),
  // See submitKycFile: identity/type are pre-buffer checks; country policy is post-parse.
  authorizeManagedProfile({ capability: ManagedProfileCapability.CredentialManage, customerType: "business" }),
  rejectImpersonation,
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "business"
  }),
  AlfredpayController.submitKybRelatedPersonFile
);
router.post(
  "/sendKybSubmission",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({
    capability: ManagedProfileCapability.CredentialManage,
    corridor: getManagedProfileCountryCorridor,
    customerType: "business"
  }),
  rejectImpersonation,
  AlfredpayController.sendKybSubmission
);

// Fiat accounts (USD + MXN) — accept user-scoped secret API keys (sk_*) or Supabase Bearer
// via requirePartnerOrUserAuth, so SDK/server integrations can manage fiat accounts without
// a Supabase session.
router.post(
  "/fiatAccounts",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ capability: ManagedProfileCapability.Manage, corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.addFiatAccount
);
router.get(
  "/fiatAccounts",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ capability: ManagedProfileCapability.Read }),
  AlfredpayController.listFiatAccounts
);
router.delete(
  "/fiatAccounts/:fiatAccountId",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ capability: ManagedProfileCapability.Manage, corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.deleteFiatAccount
);

export default router;
