import { Router } from "express";
import * as contactController from "../../controllers/contact.controller";
import { validateContactInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/submit").post(validateContactInput, contactController.submitContact);

export default router;
