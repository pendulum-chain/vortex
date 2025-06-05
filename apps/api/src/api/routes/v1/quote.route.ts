import { Router } from 'express';
import { createQuote } from '../../controllers/quote.controller';

const router: Router = Router({ mergeParams: true });

router.route('/').post(createQuote);

export default router;
