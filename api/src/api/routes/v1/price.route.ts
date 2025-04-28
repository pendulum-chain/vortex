import { Router } from 'express';
import { getPriceForProvider, getAllPricesBundled } from '../../controllers/price.controller';
import { validatePriceInput, PriceQuery } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

// Route for getting price from a specific provider
router
  .route('/')
  .get<Record<string, never>, unknown, Record<string, never>, PriceQuery>(validatePriceInput, getPriceForProvider);

// Route for getting prices from all providers bundled
router
  .route('/all')
  .get<Record<string, never>, unknown, Record<string, never>, PriceQuery>(validatePriceInput, getAllPricesBundled);

export default router;
