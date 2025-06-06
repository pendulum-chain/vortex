import { Router } from 'express';
import { getSupportedPaymentMethods } from '../../controllers/payment-methods.controller';

const router: Router = Router({ mergeParams: true });

router.route('/').get(getSupportedPaymentMethods);

export default router;
