import { Router } from 'express';
import { fundEphemeralAccountController } from '../../controllers/pendulum.controller';

const router: Router = Router({ mergeParams: true });

router.post('/fundEphemeral', fundEphemeralAccountController);

export default router;
