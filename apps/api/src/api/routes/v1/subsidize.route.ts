import { Router } from 'express';
import * as subsidizeController from '../../controllers/subsidize.controller';
import { validatePostSwapSubsidizationInput, validatePreSwapSubsidizationInput } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/preswap').post(validatePreSwapSubsidizationInput, subsidizeController.subsidizePreSwap);
router.route('/postswap').post(validatePostSwapSubsidizationInput, subsidizeController.subsidizePostSwap);

export default router;
