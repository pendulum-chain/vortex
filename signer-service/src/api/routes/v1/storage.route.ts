import { Router } from 'express';
import * as storageController from '../../controllers/storage.controller';
import { validateStorageInput } from '../../middlewares/validators';

const router: Router = Router({ mergeParams: true });

router.route('/create').post(validateStorageInput, storageController.storeData);

export default router;
