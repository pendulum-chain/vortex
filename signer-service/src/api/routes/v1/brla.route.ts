import { Router } from 'express';
import * as brlaController from '../../controllers/brla.controller';
import { validateBrlaTriggerOfframpInput, validataSubaccountCreation } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/getUser').get(brlaController.getBrlaUser);

router.route('/getOfframpStatus').get(brlaController.getOfframpStatus);

router.route('/getKycStatus').get(brlaController.fetchSubaccountKycStatus);

router.route('/triggerOfframp').post(validateBrlaTriggerOfframpInput, brlaController.triggerBrlaOfframp);

router.route('/createSubaccount').post(validataSubaccountCreation, brlaController.createSubaccount);

export default router;
