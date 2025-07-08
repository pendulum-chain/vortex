import { Router } from "express";
import * as moneriumController from "../../controllers/monerium.controller";

const router: Router = Router({ mergeParams: true });

router.route("/address-exists").get(moneriumController.checkAddressExistsController);

export default router;
