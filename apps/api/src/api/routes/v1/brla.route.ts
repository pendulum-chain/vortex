import { RequestHandler, Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { optionalPartnerOrUserAuth, requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile } from "../../middlewares/managedProfileAuth";
import {
  validateAveniaKybDocument,
  validateAveniaKybLevel1,
  validateAveniaKybUbo,
  validateStartKyc2,
  validateSubaccountCreation
} from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

// Controllers use typed Request generics (e.g. Request<unknown, unknown, unknown, BrGetUserRequest>)
// which don't extend Express's ParsedQs. Double-cast via unknown is the standard Express pattern
// for combining middleware with narrowly-typed handlers. Runtime query validation is in each controller.
//
// /getUser, /getUserRemainingLimit, and /validatePixKey use optionalPartnerOrUserAuth so that SDK
// clients without API keys can drive a BRL ramp pre-flight against fully-anonymous quotes. The
// controllers themselves apply ownership scoping using `getEffectiveUserId`;
router.get(
  "/getUser",
  optionalPartnerOrUserAuth(),
  authorizeManagedProfile(),
  brlaController.getAveniaUser as unknown as RequestHandler
);

router.get(
  "/getUserRemainingLimit",
  optionalPartnerOrUserAuth(),
  authorizeManagedProfile(),
  brlaController.getAveniaUserRemainingLimit as unknown as RequestHandler
);

router.get(
  "/getKycStatus",
  requirePartnerOrUserAuth(),
  authorizeManagedProfile(),
  brlaController.fetchSubaccountKycStatus as unknown as RequestHandler
);

router.get(
  "/getSelfieLivenessUrl",
  requirePartnerOrUserAuth(),
  authorizeManagedProfile({ corridor: "BR" }),
  rejectImpersonation,
  brlaController.getSelfieLivenessUrl as unknown as RequestHandler
);

router.get("/validatePixKey", optionalPartnerOrUserAuth(), brlaController.validatePixKey as unknown as RequestHandler);

router
  .route("/createSubaccount")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    rejectImpersonation,
    validateSubaccountCreation,
    brlaController.createSubaccount as unknown as RequestHandler
  );

router
  .route("/getUploadUrls")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR", customerType: "individual" }),
    rejectImpersonation,
    validateStartKyc2,
    brlaController.getUploadUrls
  );

router
  .route("/newKyc")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR", customerType: "individual" }),
    rejectImpersonation,
    brlaController.newKyc
  );

router
  .route("/kyb/new-level-1/web-sdk")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    rejectImpersonation,
    brlaController.initiateKybLevel1
  );

router
  .route("/kyb/documents")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    rejectImpersonation,
    validateAveniaKybDocument,
    brlaController.createKybDocument as unknown as RequestHandler
  );

router
  .route("/kyb/documents/:documentId")
  .get(requirePartnerOrUserAuth(), authorizeManagedProfile(), brlaController.getKybDocument as unknown as RequestHandler);

router
  .route("/kyb/ubos")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    rejectImpersonation,
    validateAveniaKybUbo,
    brlaController.createKybUbo as unknown as RequestHandler
  );

router
  .route("/kyb/new-level-1/api")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    rejectImpersonation,
    validateAveniaKybLevel1,
    brlaController.submitKybLevel1Api as unknown as RequestHandler
  );

router
  .route("/kyb/attempt-status")
  .get(requirePartnerOrUserAuth(), authorizeManagedProfile(), brlaController.getKybAttemptStatus as unknown as RequestHandler);

router
  .route("/kyc/record-attempt")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    rejectImpersonation,
    brlaController.recordInitialKycAttempt
  );

export default router;
