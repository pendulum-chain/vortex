import { Router } from "express";
import * as quoteController from "../../controllers/quote.controller";
import * as rampController from "../../controllers/ramp.controller";

const router = Router();

/**
 * @api {post} v1/ramp/register Register ramping process
 * @apiDescription Register a new ramping process
 * @apiVersion 1.0.0
 * @apiName RegisterRamp
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  quoteId        Quote ID
 * @apiParam  {Array}   signingAccounts   Ephemerals used in the client
 * @apiParam  {Object}  [additionalData] Additional data
 *
 * @apiSuccess (Created 201) {String}  id           Ramp ID
 * @apiSuccess (Created 201) {String}  type         Ramp type
 * @apiSuccess (Created 201) {String}  currentPhase Current phase
 * @apiSuccess (Created 201) {String}  from         DestinationType
 * @apiSuccess (Created 201) {String}  to           DestinationType
 * @apiSuccess (Created 201) {Object}  state        State
 * @apiSuccess (Created 201) {Date}    createdAt    Creation date
 * @apiSuccess (Created 201) {Date}    updatedAt    Update date
 * @apiSuccess (Created 201) {Array}   unsignedTxs    Array of unsigned txs that need to be signed by the signingAccounts on the client.
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Quote does not exist
 */

router.post("/register", rampController.registerRamp);

/**
 * @api {post} v1/ramp/update Update ramping process
 * @apiDescription Update a ramping process with presigned transactions and additional data
 * @apiVersion 1.0.0
 * @apiName UpdateRamp
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  rampId        Ramp ID (URL parameter)
 * @apiParam  {Array}   presignedTxs   Presigned transactions
 * @apiParam  {Object}  [additionalData] Additional data (squidRouterApproveHash, squidRouterSwapHash, assethubToPendulumHash, etc.)
 *
 * @apiSuccess (OK 200) {String}  id           Ramp ID
 * @apiSuccess (OK 200) {String}  type         Ramp type
 * @apiSuccess (OK 200) {String}  currentPhase Current phase
 * @apiSuccess (OK 200) {String}  from         DestinationType
 * @apiSuccess (OK 200) {String}  to           DestinationType
 * @apiSuccess (OK 200) {Object}  state        State
 * @apiSuccess (OK 200) {Date}    createdAt    Creation date
 * @apiSuccess (OK 200) {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Ramp does not exist
 * @apiError (Conflict 409) ConflictError Ramp is not in a state that allows updates
 */
router.post("/update", rampController.updateRamp);

/**
 * @api {post} v1/ramp/start Start ramping process
 * @apiDescription Start a new ramping process
 * @apiVersion 1.0.0
 * @apiName StartRamp
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  rampId        Ramp ID
 * @apiParam  {Array}   presignedTxs   Presigned transactions
 * @apiParam  {Object}  [additionalData] Additional data
 *
 * @apiSuccess (Created 201) {String}  id           Ramp ID
 * @apiSuccess (Created 201) {String}  type         Ramp type
 * @apiSuccess (Created 201) {String}  currentPhase Current phase
 * @apiSuccess (Created 201) {String}  from         DestinationType
 * @apiSuccess (Created 201) {String}  to           DestinationType
 * @apiSuccess (Created 201) {Object}  state        State
 * @apiSuccess (Created 201) {Date}    createdAt    Creation date
 * @apiSuccess (Created 201) {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Quote does not exist
 */
router.post("/start", rampController.startRamp);

/**
 * @api {get} v1/ramp/:id Get ramp status
 * @apiDescription Get the status of a ramping process
 * @apiVersion 1.0.0
 * @apiName GetRampStatus
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id  Ramp ID
 *
 * @apiSuccess {String}  id           Ramp ID
 * @apiSuccess {String}  type         Ramp type
 * @apiSuccess {String}  currentPhase Current phase
 * @apiSuccess {String}  from         DestinationType
 * @apiSuccess {String}  to           DestinationType
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.get("/:id", rampController.getRampStatus);

/**
 * @api {get} v1/ramp/:id/errors Get error logs
 * @apiDescription Get the error logs of a ramping process
 * @apiVersion 1.0.0
 * @apiName GetErrorLogs
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id  Ramp ID
 *
 * @apiSuccess {Array}   errorLogs Error logs
 *
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.get("/:id/errors", rampController.getErrorLogs);

/**
 * @api {get} v1/ramp/history/:walletAddress Get transaction history
 * @apiDescription Get transaction history for a wallet address
 * @apiVersion 1.0.0
 * @apiName getRampHistory
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam {String} walletAddress Wallet address
 *
 * @apiSuccess {Array} transactions List of transactions
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 */
router.get("/history/:walletAddress", rampController.getRampHistory);

export default router;
