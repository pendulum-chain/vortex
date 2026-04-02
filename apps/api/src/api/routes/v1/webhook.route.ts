import { Router } from "express";
import * as webhookController from "../../controllers/webhook.controller";
import { apiKeyAuth } from "../../middlewares/apiKeyAuth";

const router = Router();

router.route("/").post(apiKeyAuth({ required: true }), webhookController.registerWebhook);

router.route("/:id").delete(apiKeyAuth({ required: true }), webhookController.deleteWebhook);

export default router;
