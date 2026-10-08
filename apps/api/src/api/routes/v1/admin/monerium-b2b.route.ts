import { Router } from "express";
import {
  getMoneriumB2bRefundAddress,
  listMoneriumB2bAccountsForAdmin,
  listMoneriumB2bRegistrationsForAdmin,
  patchMoneriumB2bAccountStatus,
  patchMoneriumB2bDepositStatus,
  postMoneriumB2bAccount,
  postMoneriumB2bDepositRecovery,
  postMoneriumB2bRegistrationWithdrawal
} from "../../../controllers/admin/moneriumB2b.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

// Maps a Monerium-onboarded corporate to a managed profile and records its
// deployed forwarder as a B2B onramp account. Idempotent.
router.post("/accounts", postMoneriumB2bAccount);

// Every account with its partner manager; ?status=onboarding lists those awaiting activation.
router.get("/accounts", listMoneriumB2bAccountsForAdmin);

// The client's derived refund wallet, passed as `recoveryAddress` when deploying its forwarder.
router.get("/refund-address", getMoneriumB2bRefundAddress);

// Partner registrations with the keeper's progress; a requested one can be withdrawn,
// after which the partner registers it again.
router.get("/registrations", listMoneriumB2bRegistrationsForAdmin);
router.post("/registrations/:registrationId/withdraw", postMoneriumB2bRegistrationWithdrawal);

// Operator lifecycle transitions (activate, suspend on a failed destination check, close).
router.patch("/accounts/:accountId/status", patchMoneriumB2bAccountStatus);

// Refund path (runbook §2.7): mark a settling deposit for recovery — the keeper moves
// its funds to the client's refund wallet once the clone allows it — and close or retry
// a recovery by hand.
router.post("/deposits/:depositId/recover", postMoneriumB2bDepositRecovery);
router.patch("/deposits/:depositId/status", patchMoneriumB2bDepositStatus);

export default router;
