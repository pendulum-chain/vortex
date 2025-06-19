import { Router } from "express";
import * as stellarController from "../../controllers/stellar.controller";
import { getMemoFromCookiesMiddleware } from "../../middlewares/auth";
import { validateChangeOpInput, validateCreationInput, validateSep10Input } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(validateCreationInput, stellarController.createStellarTransactionHandler);

// Only authorized route. Does not reject the request, but rather passes the memo (if any) derived from a valid cookie in the request.
router
  .route("/sep10")
  .post([validateSep10Input, getMemoFromCookiesMiddleware], stellarController.signSep10ChallengeHandler)
  .get(stellarController.getSep10MasterPKHandler);

export default router;
