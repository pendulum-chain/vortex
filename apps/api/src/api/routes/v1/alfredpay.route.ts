import { Router } from "express";
import multer from "multer";
import { AlfredpayController } from "../../controllers/alfredpay.controller";
import { validateResultCountry } from "../../middlewares/alfredpay.middleware";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile } from "../../middlewares/managedProfileAuth";
import { getManagedProfileCountryCorridor } from "../../middlewares/managedProfileCorridor";
import { validateKybSubmission, validateKycSubmission } from "../../middlewares/validators";

const router = Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.get(
  "/alfredpayStatus",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile(),
  AlfredpayController.alfredpayStatus
);
router.post(
  "/createIndividualCustomer",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.createIndividualCustomer
);
router.get(
  "/getKycRedirectLink",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.getKycRedirectLink
);
router.post(
  "/kycRedirectOpened",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.kycRedirectOpened
);
router.post(
  "/kycRedirectFinished",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
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
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.retryKyc
);
router.post(
  "/createBusinessCustomer",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.createBusinessCustomer
);
router.get(
  "/getKybRedirectLink",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.getKybRedirectLink
);

// MXN/CO API-based KYC
router.post(
  "/submitKycInformation",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  validateKycSubmission,
  AlfredpayController.submitKycInformation
);
router.post(
  "/submitKycFile",
  requirePartnerOrUserAuth(),
  authorizeManagedProfile(),
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.submitKycFile
);
router.post(
  "/sendKycSubmission",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.sendKycSubmission
);

// Business API-based KYB
router.post(
  "/submitKybInformation",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  validateKybSubmission,
  AlfredpayController.submitKybInformation
);
router.post(
  "/submitKybFile",
  requirePartnerOrUserAuth(),
  authorizeManagedProfile(),
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
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
  authorizeManagedProfile(),
  upload.single("file"),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
  AlfredpayController.submitKybRelatedPersonFile
);
router.post(
  "/sendKybSubmission",
  requirePartnerOrUserAuth(),
  validateResultCountry,
  authorizeManagedProfile({ corridor: getManagedProfileCountryCorridor }),
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
