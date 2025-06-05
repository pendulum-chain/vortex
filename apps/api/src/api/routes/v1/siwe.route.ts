import { Router } from 'express';
import * as siweController from '../../controllers/siwe.controller';
import { validateSiweCreate, validateSiweValidate } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/create').post(validateSiweCreate, siweController.sendSiweMessage);

router.route('/validate').post(validateSiweValidate, siweController.validateSiweSignature);

export default router;
