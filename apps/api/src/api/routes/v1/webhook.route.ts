import { Router } from "express";
import * as webhookController from "../../controllers/webhook.controller";
import { apiKeyAuth } from "../../middlewares/apiKeyAuth";
import { rejectDirectManagedCredential, rejectManagedProfileSelection } from "../../middlewares/managedProfileAuth";

const router = Router();

// Webhooks are registered against the manager's own credential scope, so a child selection
// would silently produce a subscription the caller did not ask for.
router
  .route("/")
  .post(
    apiKeyAuth({ required: true }),
    rejectDirectManagedCredential,
    rejectManagedProfileSelection,
    webhookController.registerWebhook
  );

router
  .route("/:id")
  .delete(
    apiKeyAuth({ required: true }),
    rejectDirectManagedCredential,
    rejectManagedProfileSelection,
    webhookController.deleteWebhook
  );

export default router;
