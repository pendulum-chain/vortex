import { RequestHandler, Router } from "express";
import * as brlaController from "../../controllers/brla.controller";
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
  brlaController.getSelfieLivenessUrl as unknown as RequestHandler
);

router.get("/validatePixKey", optionalPartnerOrUserAuth(), brlaController.validatePixKey as unknown as RequestHandler);

router
  .route("/createSubaccount")
  .post(
    validateSubaccountCreation,
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    brlaController.createSubaccount as unknown as RequestHandler
  );

router
  .route("/getUploadUrls")
  .post(
    validateStartKyc2,
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR", customerType: "individual" }),
    brlaController.getUploadUrls
  );

router
  .route("/newKyc")
  .post(
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR", customerType: "individual" }),
    brlaController.newKyc
  );

router
  .route("/kyb/new-level-1/web-sdk")
  .post(requirePartnerOrUserAuth(), authorizeManagedProfile({ corridor: "BR" }), brlaController.initiateKybLevel1);

router
  .route("/kyb/documents")
  .post(
    validateAveniaKybDocument,
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    brlaController.createKybDocument as unknown as RequestHandler
  );

router
  .route("/kyb/documents/:documentId")
  .get(requirePartnerOrUserAuth(), authorizeManagedProfile(), brlaController.getKybDocument as unknown as RequestHandler);

router
  .route("/kyb/ubos")
  .post(
    validateAveniaKybUbo,
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    brlaController.createKybUbo as unknown as RequestHandler
  );

router
  .route("/kyb/new-level-1/api")
  .post(
    validateAveniaKybLevel1,
    requirePartnerOrUserAuth(),
    authorizeManagedProfile({ corridor: "BR" }),
    brlaController.submitKybLevel1Api as unknown as RequestHandler
  );

router
  .route("/kyb/attempt-status")
  .get(requirePartnerOrUserAuth(), authorizeManagedProfile(), brlaController.getKybAttemptStatus as unknown as RequestHandler);

router
  .route("/kyc/record-attempt")
  .post(requirePartnerOrUserAuth(), authorizeManagedProfile({ corridor: "BR" }), brlaController.recordInitialKycAttempt);

export default router;
