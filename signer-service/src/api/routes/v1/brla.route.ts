import { Router } from 'express';
import * as brlaController from '../../controllers/brla.controller';
import { validateBrlaTriggerOfframpInput } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/triggerOfframp').post(validateBrlaTriggerOfframpInput, brlaController.getBrlaUser);

router.route('/getUser').get(brlaController.getBrlaUser);

export default router;
