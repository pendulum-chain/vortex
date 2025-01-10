import { Router } from 'express';
import { executeXcmController } from '../../controllers/moonbeam.controller';
import { validateExecuteXCM } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/execute-xcm').post(validateExecuteXCM, executeXcmController);

export default router;
