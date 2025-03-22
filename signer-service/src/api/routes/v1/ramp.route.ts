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
 * @api {patch} v1/ramp/:id/phase Advance ramp phase
 * @apiDescription Advance a ramping process to the next phase
 * @apiVersion 1.0.0
 * @apiName AdvanceRamp
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id    Ramp ID
 * @apiParam  {String}  phase New phase
 *
 * @apiSuccess {String}  id           Ramp ID
 * @apiSuccess {String}  type         Ramp type
 * @apiSuccess {String}  currentPhase Current phase
 * @apiSuccess {Number}  chainId      Chain ID
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.patch('/:id/phase', rampController.advanceRamp);

/**
 * @api {patch} v1/ramp/:id/state Update ramp state
 * @apiDescription Update the state of a ramping process
 * @apiVersion 1.0.0
 * @apiName UpdateRampState
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id    Ramp ID
 * @apiParam  {Object}  state State
 *
 * @apiSuccess {String}  id           Ramp ID
 * @apiSuccess {String}  type         Ramp type
 * @apiSuccess {String}  currentPhase Current phase
 * @apiSuccess {Number}  chainId      Chain ID
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.patch('/:id/state', rampController.updateRampState);

/**
 * @api {patch} v1/ramp/:id/subsidy Update subsidy details
 * @apiDescription Update the subsidy details of a ramping process
 * @apiVersion 1.0.0
 * @apiName UpdateSubsidyDetails
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id             Ramp ID
 * @apiParam  {Object}  subsidyDetails Subsidy details
 *
 * @apiSuccess {String}  id           Ramp ID
 * @apiSuccess {String}  type         Ramp type
 * @apiSuccess {String}  currentPhase Current phase
 * @apiSuccess {Number}  chainId      Chain ID
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.patch('/:id/subsidy', rampController.updateSubsidyDetails);

/**
 * @api {patch} v1/ramp/:id/nonce Update nonce sequences
 * @apiDescription Update the nonce sequences of a ramping process
 * @apiVersion 1.0.0
 * @apiName UpdateNonceSequences
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id             Ramp ID
 * @apiParam  {Object}  nonceSequences Nonce sequences
 *
 * @apiSuccess {String}  id           Ramp ID
 * @apiSuccess {String}  type         Ramp type
 * @apiSuccess {String}  currentPhase Current phase
 * @apiSuccess {Number}  chainId      Chain ID
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.patch('/:id/nonce', rampController.updateNonceSequences);

/**
 * @api {post} v1/ramp/:id/error Log an error
 * @apiDescription Log an error for a ramping process
 * @apiVersion 1.0.0
 * @apiName LogRampError
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id      Ramp ID
 * @apiParam  {String}  error   Error message
 * @apiParam  {Object}  details Error details
 *
 * @apiSuccess {String}  id           Ramp ID
 * @apiSuccess {String}  type         Ramp type
 * @apiSuccess {String}  currentPhase Current phase
 * @apiSuccess {Number}  chainId      Chain ID
 * @apiSuccess {Object}  state        State
 * @apiSuccess {Date}    createdAt    Creation date
 * @apiSuccess {Date}    updatedAt    Update date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.post('/:id/error', rampController.logRampError);

/**
 * @api {get} v1/ramp/:id/history Get phase history
 * @apiDescription Get the phase history of a ramping process
 * @apiVersion 1.0.0
 * @apiName GetPhaseHistory
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  id  Ramp ID
 *
 * @apiSuccess {Array}   phaseHistory Phase history
 *
 * @apiError (Not Found 404) NotFound Ramp does not exist
 */
router.get('/:id/history', rampController.getPhaseHistory);

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

/**
 * @api {get} v1/ramp/phases/:phase/transitions Get valid transitions
 * @apiDescription Get the valid transitions for a phase
 * @apiVersion 1.0.0
 * @apiName GetValidTransitions
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  phase Phase name
 *
 * @apiSuccess {Array}   validTransitions Valid transitions
 */
router.get('/phases/:phase/transitions', rampController.getValidTransitions);

export default router;
