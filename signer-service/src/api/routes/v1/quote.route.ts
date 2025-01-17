import { Router } from 'express';
import { getQuoteForProvider } from '../../controllers/quote.controller';
import { validateQuoteInput } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/').get(validateQuoteInput, getQuoteForProvider);

export default router;
