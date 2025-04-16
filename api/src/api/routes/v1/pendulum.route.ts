import { Router } from 'express';
import { fundEphemeralAccountController } from '../../controllers/pendulum.controller';

const router: Router = Router();

router.post('/fundEphemeral', fundEphemeralAccountController);

export default router;
