import { Router } from "express";
import { createBestQuote, createQuote, getQuote } from "../../controllers/quote.controller";
import { apiKeyAuth } from "../../middlewares/apiKeyAuth";
import { validatePublicKey } from "../../middlewares/publicKeyAuth";
import { optionalAuth } from "../../middlewares/supabaseAuth";
import { validateCreateBestQuoteInput, validateCreateQuoteInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

/**
 * @api {post} v1/quotes Create a new quote
 * @apiDescription Create a new quote for ramping
 * @apiVersion 1.0.0
 * @apiName CreateQuote
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  rampType       Ramp type (on/off)
 * @apiParam  {String}  from           DestinationType
 * @apiParam  {String}  to           DestinationType
 * @apiParam  {String}  inputAmount    Input amount
 * @apiParam  {String}  inputCurrency  Input currency
 * @apiParam  {String}  outputCurrency Output currency
 * @apiParam  {String}  [partnerId]    Partner ID (requires secret key authentication)
 * @apiParam  {String}  [apiKey]       Public API key (pk_*) for tracking and discounts
 *
 * @apiHeader {String} [X-API-Key] Secret API key (sk_*) for partner authentication (required if partnerId is provided)
 *
 * @apiSuccess (Created 201) {String}  id             Quote ID
 * @apiSuccess (Created 201) {String}  rampType       Ramp type
 * @apiSuccess (Created 201) {String}  from           DestinationType
 * @apiSuccess (Created 201) {String}  to             DestinationType
 * @apiSuccess (Created 201) {String}  inputAmount    Input amount
 * @apiSuccess (Created 201) {String}  inputCurrency  Input currency
 * @apiSuccess (Created 201) {String}  outputAmount   Output amount
 * @apiSuccess (Created 201) {String}  outputCurrency Output currency
 * @apiSuccess (Created 201) {Date}    expiresAt      Expiration date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Unauthorized 401) InvalidApiKey The provided API key is invalid or expired
 * @apiError (Forbidden 403) AuthenticationRequired Authentication is required when partnerId is specified
 * @apiError (Forbidden 403) PartnerMismatch The authenticated partner does not match the partnerId
 */
router.route("/").post(
  validateCreateQuoteInput,
  optionalAuth, // Extract userId from Bearer token if provided (optional)
  validatePublicKey(), // Validate public key if provided (optional)
  apiKeyAuth({ required: false }), // Validate secret key if provided (optional)
  // enforcePartnerAuth(), // Enforce secret key auth if partnerId present // We don't enforce this for now and allow passing a partnerId without secret key
  createQuote
);

/**
 * @api {post} v1/quotes/best Create best quote across all networks
 * @apiDescription Create a quote by comparing all eligible networks and selecting the best one
 * @apiVersion 1.0.0
 * @apiName CreateBestQuote
 * @apiGroup Ramp
 * @apiPermission public
 *
 * @apiParam  {String}  rampType       Ramp type (on/off)
 * @apiParam  {String}  from           DestinationType
 * @apiParam  {String}  to             DestinationType
 * @apiParam  {String}  inputAmount    Input amount
 * @apiParam  {String}  inputCurrency  Input currency
 * @apiParam  {String}  outputCurrency Output currency
 * @apiParam  {String}  [partnerId]    Partner ID (requires secret key authentication)
 * @apiParam  {String}  [apiKey]       Public API key (pk_*) for tracking and discounts
 * @apiParam  {String}  [countryCode]  Country code for region-specific processing
 *
 * @apiHeader {String} [X-API-Key] Secret API key (sk_*) for partner authentication (required if partnerId is provided)
 *
 * @apiSuccess (Created 201) {String}  id                Quote ID
 * @apiSuccess (Created 201) {String}  rampType          Ramp type
 * @apiSuccess (Created 201) {String}  from              DestinationType
 * @apiSuccess (Created 201) {String}  to                DestinationType
 * @apiSuccess (Created 201) {String}  inputAmount       Input amount
 * @apiSuccess (Created 201) {String}  inputCurrency     Input currency
 * @apiSuccess (Created 201) {String}  outputAmount      Output amount
 * @apiSuccess (Created 201) {String}  outputCurrency    Output currency
 * @apiSuccess (Created 201) {String}  network           Selected network for the quote
 * @apiSuccess (Created 201) {String}  networkFeeFiat    Network fee in fiat currency
 * @apiSuccess (Created 201) {String}  anchorFeeFiat     Anchor fee in fiat currency
 * @apiSuccess (Created 201) {String}  vortexFeeFiat     Vortex fee in fiat currency
 * @apiSuccess (Created 201) {String}  partnerFeeFiat    Partner fee in fiat currency
 * @apiSuccess (Created 201) {String}  totalFeeFiat      Total fee in fiat currency
 * @apiSuccess (Created 201) {String}  processingFeeFiat Processing fee (anchor + vortex) in fiat currency
 * @apiSuccess (Created 201) {String}  feeCurrency       Currency used for fee display
 * @apiSuccess (Created 201) {String}  networkFeeUsd     Network fee in USD
 * @apiSuccess (Created 201) {String}  anchorFeeUsd      Anchor fee in USD
 * @apiSuccess (Created 201) {String}  vortexFeeUsd      Vortex fee in USD
 * @apiSuccess (Created 201) {String}  partnerFeeUsd     Partner fee in USD
 * @apiSuccess (Created 201) {String}  totalFeeUsd       Total fee in USD
 * @apiSuccess (Created 201) {String}  processingFeeUsd  Processing fee (anchor + vortex) in USD
 * @apiSuccess (Created 201) {String}  paymentMethod     Payment method used for the quote
 * @apiSuccess (Created 201) {Date}    expiresAt         Expiration date
 *
 * @apiError (Bad Request 400) ValidationError Some parameters may contain invalid values
 * @apiError (Unauthorized 401) InvalidApiKey The provided API key is invalid or expired
 * @apiError (Forbidden 403) AuthenticationRequired Authentication is required when partnerId is specified
 * @apiError (Forbidden 403) PartnerMismatch The authenticated partner does not match the partnerId
 */
router.route("/best").post(
  validateCreateBestQuoteInput,
  optionalAuth, // Extract userId from Bearer token if provided (optional)
  validatePublicKey(), // Validate public key if provided (optional)
  apiKeyAuth({ required: false }), // Validate secret key if provided (optional)
  createBestQuote
);

/**
 * @api {get} v1/quotes/:id Get quote
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
 * @apiSuccess {String}  from           DestinationType
 * @apiSuccess {String}  to             DestinationType
 * @apiSuccess {String}  inputAmount    Input amount
 * @apiSuccess {String}  inputCurrency  Input currency
 * @apiSuccess {String}  outputAmount   Output amount
 * @apiSuccess {String}  outputCurrency Output currency
 * @apiSuccess {Date}    expiresAt      Expiration date
 *
 * @apiError (Not Found 404) NotFound Quote does not exist
 */
router.get("/:id", getQuote);

export default router;
