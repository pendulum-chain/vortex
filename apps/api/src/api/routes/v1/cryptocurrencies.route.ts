import { Router } from 'express';
import { getSupportedCryptocurrenciesHandler } from '../../controllers/cryptocurrencies.controller';

const router: Router = Router({ mergeParams: true });

router.route('/').get(getSupportedCryptocurrenciesHandler);

export default router;
