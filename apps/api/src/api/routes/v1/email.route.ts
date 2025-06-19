import { Router } from "express";
import * as emailController from "../../controllers/email.controller";
import { validateEmailInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(validateEmailInput, emailController.storeEmail);

export default router;
