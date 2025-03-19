import { Router } from 'express';
import * as brlaController from '../../controllers/brla.controller';
import {
  validateBrlaTriggerOfframpInput,
  validataSubaccountCreation,
  validateTriggerPayIn,
  validateGetPayInCode,
} from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/getUser').get(brlaController.getBrlaUser);

router.route('/getOfframpStatus').get(brlaController.getOfframpStatus);

router.route('/getKycStatus').get(brlaController.fetchSubaccountKycStatus);

router.route('/validatePixKey').get(brlaController.validatePixKey);

router.route('/payIn').get(validateGetPayInCode, brlaController.getPayInCode);

router.route('/triggerOfframp').post(validateBrlaTriggerOfframpInput, brlaController.triggerBrlaOfframp);

router.route('/createSubaccount').post(validataSubaccountCreation, brlaController.createSubaccount);

router.route('/triggerPayIn').post(validateTriggerPayIn, brlaController.triggerPayIn);

export default router;
