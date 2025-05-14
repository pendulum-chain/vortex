import { Router } from 'express';
import { getPriceForProvider, getAllPricesBundled } from '../../controllers/price.controller';
import { validatePriceInput, PriceQuery, validateBundledPriceInput } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router
  .route('/')
  .get<Record<string, never>, unknown, Record<string, never>, PriceQuery>(validatePriceInput, getPriceForProvider);

router
  .route('/all')
  .get<
    Record<string, never>,
    unknown,
    Record<string, never>,
    PriceQuery
  >(validateBundledPriceInput, getAllPricesBundled);

export default router;
