import { Router } from 'express';
import * as quoteController from '../../controllers/quote.controller';
import * as rampController from '../../controllers/ramp.controller';

const router = Router();

/**
 * @api {post} v1/ramp/quotes Create a new quote
 * @apiDescription Create a new quote for ramping
 * @apiVersion 1.0.0
 * @apiName CreateQuote
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  rampType       Ramp type (on/off)
 * @apiParam  {Number}  chainId        Chain ID
 * @apiParam  {String}  inputAmount    Input amount
 * @apiParam  {String}  inputCurrency  Input currency
 * @apiParam  {String}  outputCurrency Output currency
 *
 * @apiSuccess (Created 201) {String}  id             Quote ID
 * @apiSuccess (Created 201) {String}  rampType       Ramp type
 * @apiSuccess (Created 201) {Number}  chainId        Chain ID
 * @apiSuccess (Created 201) {String}  inputAmount    Input amount
 * @apiSuccess (Created 201) {String}  inputCurrency  Input currency
 * @apiSuccess (Created 201) {String}  outputAmount   Output amount
 * @apiSuccess (Created 201) {String}  outputCurrency Output currency
 * @apiSuccess (Created 201) {Date}    expiresAt      Expiration date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 */
router.post('/quotes', quoteController.createQuote);

/**
 * @api {get} v1/ramp/quotes/:id Get quote
 * @apiDescription Get quote information
 * @apiVersion 1.0.0
 * @apiName GetQuote
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id  Quote ID
 *
 * @apiSuccess {String}  id             Quote ID
 * @apiSuccess {String}  rampType       Ramp type
 * @apiSuccess {Number}  chainId        Chain ID
 * @apiSuccess {String}  inputAmount    Input amount
 * @apiSuccess {String}  inputCurrency  Input currency
 * @apiSuccess {String}  outputAmount   Output amount
 * @apiSuccess {String}  outputCurrency Output currency
 * @apiSuccess {Date}    expiresAt      Expiration date
 *
 * @apiError (Not Found 404) NotFound Quote does not exist
 */
router.get('/quotes/:id', quoteController.getQuote);

/**
 * @api {post} v1/ramp/start Start ramping process
 * @apiDescription Start a new ramping process
 * @apiVersion 1.0.0
 * @apiName StartRamp
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiHeader {String} [Idempotency-Key] Idempotency key
 *
 * @apiParam  {String}  quoteId        Quote ID
 * @apiParam  {Array}   presignedTxs   Presigned transactions
 * @apiParam  {Object}  [additionalData] Additional data
 *
 * @apiSuccess (Created 201) {String}  id           Ramp ID
 * @apiSuccess (Created 201) {String}  type         Ramp type
 * @apiSuccess (Created 201) {String}  currentPhase Current phase
 * @apiSuccess (Created 201) {Number}  chainId      Chain ID
 * @apiSuccess (Created 201) {Object}  state        State
 * @apiSuccess (Created 201) {Date}    createdAt    Creation date
 * @apiSuccess (Created 201) {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Quote does not exist
 */
router.post('/start', rampController.startRamp);

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
 * @apiSuccess {Number}  chainId      Chain ID
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.get('/:id', rampController.getRampStatus);

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
router.get('/:id/errors', rampController.getErrorLogs);

export default router;
