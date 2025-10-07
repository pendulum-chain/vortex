import { Router } from "express";
import * as sessionController from "../../controllers/session.controller";
import { validateGetWidgetUrlInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(validateGetWidgetUrlInput, sessionController.create);

export default router;
