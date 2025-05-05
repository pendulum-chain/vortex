import { Router } from 'express';
import * as brlaController from '../../controllers/brla.controller';
import {
  validateBrlaTriggerOfframpInput,
  validataSubaccountCreation,
  validateGetPayInCode,
  validateStartKyc2,
} from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/getUser').get(brlaController.getBrlaUser);

router.route('/getUserRemainingLimit').get(brlaController.getBrlaUserRemainingLimit);

router.route('/getOfframpStatus').get(brlaController.getOfframpStatus);

router.route('/getKycStatus').get(brlaController.fetchSubaccountKycStatus);

router.route('/validatePixKey').get(brlaController.validatePixKey);

router.route('/payIn').get(validateGetPayInCode, brlaController.getPayInCode);

router.route('/triggerOfframp').post(validateBrlaTriggerOfframpInput, brlaController.triggerBrlaOfframp);

router.route('/createSubaccount').post(validataSubaccountCreation, brlaController.createSubaccount);

router.route('/startKYC2').post(validateStartKyc2, brlaController.startKYC2);

export default router;
