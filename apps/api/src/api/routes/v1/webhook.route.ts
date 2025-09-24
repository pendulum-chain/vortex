import { Router } from "express";
import * as webhookController from "../../controllers/webhook.controller";

const router = Router();

/**
 * @api {post} v1/webhooks/register Register webhook
 * @apiDescription Register a new webhook for transaction or session events
 * @apiVersion 1.0.0
 * @apiName RegisterWebhook
 * @apiGroup Webhook
 * @apiPermission public
 *
 * @apiParam  {String}  url           Webhook URL (must use HTTPS)
 * @apiParam  {String}  [transactionId] Optional: Subscribe to specific transaction
 * @apiParam  {String}  [sessionId]   Optional: Subscribe to specific session
 * @apiParam  {Array}   [events]      Optional: Event types to subscribe to (defaults to all)
 *
 * @apiSuccess (Created 201) {String}  id           Webhook ID
 * @apiSuccess (Created 201) {String}  url          Webhook URL
 * @apiSuccess (Created 201) {String}  transactionId Transaction ID (if specified)
 * @apiSuccess (Created 201) {String}  sessionId    Session ID (if specified)
 * @apiSuccess (Created 201) {Array}   events       Subscribed event types
 * @apiSuccess (Created 201) {Boolean} isActive     Whether webhook is active
 * @apiSuccess (Created 201) {Date}    createdAt    Creation date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Bad Request 400) InvalidURL URL must use HTTPS
 * @apiError (Bad Request 400) MissingTarget Either transactionId or sessionId must be provided
 */
router.post("/register", webhookController.registerWebhook);

/**
 * @api {delete} v1/webhooks/:id Delete webhook
 * @apiDescription Delete a webhook subscription
 * @apiVersion 1.0.0
 * @apiName DeleteWebhook
 * @apiGroup Webhook
 * @apiPermission public
 *
 * @apiParam  {String}  id  Webhook ID
 *
 * @apiSuccess (OK 200) {Boolean} success Whether deletion was successful
 * @apiSuccess (OK 200) {String}  message Success message
 *
 * @apiError (Not Found 404) NotFound Webhook does not exist
 */
router.delete("/:id", webhookController.deleteWebhook);

export default router;
