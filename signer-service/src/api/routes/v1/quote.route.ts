import { Router } from 'express';
import { getQuoteForProvider } from '../../controllers/quote.controller';
import { validateQuoteInput, QuoteQuery } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/').get<{}, unknown, {}, QuoteQuery>(validateQuoteInput, getQuoteForProvider);

export default router;
