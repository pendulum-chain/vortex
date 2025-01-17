import { Router } from 'express';
import * as stellarController from '../../controllers/stellar.controller';
import { validateCreationInput, validateChangeOpInput, validateSep10Input } from '../../middlewares/validators';
import { getMemoFromCookiesMiddleware } from '../../middlewares/auth';

const router: Router = Router({ mergeParams: true });

router.route('/create').post(validateCreationInput, stellarController.createStellarTransactionHandler);

router.route('/payment').post(validateChangeOpInput, stellarController.changeOpTransactionHandler);

// Only authorized route. Does not reject the request, but rather passes the memo (if any) derived from a valid cookie in the request.
router
  .route('/sep10')
  .post([validateSep10Input, getMemoFromCookiesMiddleware], stellarController.signSep10ChallengeHandler)
  .get(stellarController.getSep10MasterPKHandler);

export default router;
