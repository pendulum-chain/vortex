import { Router } from "express";
import {
  getMoneriumB2bRefundAddress,
  patchMoneriumB2bAccountStatus,
  patchMoneriumB2bDepositStatus,
  postMoneriumB2bAccount,
  postMoneriumB2bDepositRecovery
} from "../../../controllers/admin/moneriumB2b.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

// Maps a Monerium-onboarded corporate to a managed profile and records its
// deployed forwarder as a B2B onramp account. Idempotent.
router.post("/accounts", postMoneriumB2bAccount);

// The client's derived refund wallet, passed as `recoveryAddress` when deploying its forwarder.
router.get("/refund-address", getMoneriumB2bRefundAddress);

// Operator lifecycle transitions (activate, suspend, close).
router.patch("/accounts/:accountId/status", patchMoneriumB2bAccountStatus);

// Refund path (runbook §2.7): mark a settling deposit for recovery — the keeper moves
// its funds to the client's refund wallet once the clone allows it — and close or retry
// a recovery by hand.
router.post("/deposits/:depositId/recover", postMoneriumB2bDepositRecovery);
router.patch("/deposits/:depositId/status", patchMoneriumB2bDepositStatus);

export default router;
