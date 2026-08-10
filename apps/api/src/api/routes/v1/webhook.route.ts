import { Router } from "express";
import * as webhookController from "../../controllers/webhook.controller";
import { apiKeyAuth } from "../../middlewares/apiKeyAuth";
import { rejectDirectManagedCredential } from "../../middlewares/managedProfileAuth";

const router = Router();

router.route("/").post(apiKeyAuth({ required: true }), rejectDirectManagedCredential, webhookController.registerWebhook);

router.route("/:id").delete(apiKeyAuth({ required: true }), rejectDirectManagedCredential, webhookController.deleteWebhook);

export default router;
