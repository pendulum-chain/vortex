import { Router } from "express";
import * as sessionController from "../../controllers/session.controller";
import { validateCreateQuoteInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(validateCreateQuoteInput, sessionController.create);

export default router;
