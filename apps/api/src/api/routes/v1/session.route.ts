import { Router } from "express";
import * as sessionController from "../../controllers/session.controller";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(sessionController.create);

export default router;
