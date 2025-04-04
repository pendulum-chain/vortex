import { Router } from 'express';
import { getPriceForProvider } from '../../controllers/price.controller';
import { validatePriceInput, PriceQuery } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/').get<{}, unknown, {}, PriceQuery>(validatePriceInput, getPriceForProvider);

export default router;
