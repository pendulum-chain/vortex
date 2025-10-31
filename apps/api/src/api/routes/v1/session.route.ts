import { Router } from "express";
import * as sessionController from "../../controllers/session.controller";
import { validatePublicKey } from "../../middlewares/publicKeyAuth";
import { validateGetWidgetUrlInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(validateGetWidgetUrlInput, validatePublicKey(), sessionController.create);

export default router;
