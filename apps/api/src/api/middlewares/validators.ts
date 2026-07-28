import {
  AveniaKYCDataUploadRequest,
  CreateAveniaSubaccountRequest,
  CreateBestQuoteRequest,
  CreateQuoteRequest,
  Currency,
  GetWidgetUrlLocked,
  GetWidgetUrlRefresh,
  getCaseSensitiveNetwork,
  isSupportedFiatCurrency,
  isValidAveniaAccountType,
  isValidCurrencyForDirection,
  isValidDirection,
  isValidKYCDocType,
  isValidPriceProvider,
  Networks,
  PriceProvider,
  QuoteError,
  RampDirection,
  SubmitKybInformationRequest,
  SubmitKycInformationRequest,
  TokenConfig,
  VALID_CRYPTO_CURRENCIES,
  VALID_FIAT_CURRENCIES,
  VALID_PROVIDERS
} from "@vortexfi/shared";
import { Request, RequestHandler, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { CONTACT_SHEET_HEADER_VALUES } from "../controllers/contact.controller";
import { EMAIL_SHEET_HEADER_VALUES } from "../controllers/email.controller";
import { RATING_SHEET_HEADER_VALUES } from "../controllers/rating.controller";
import { FLOW_HEADERS } from "../controllers/storage.controller";
import { APIError } from "../errors/api-error";
import { buildApiClientRequestMetadata, observeApiClientEvent } from "../observability/apiClientEvent.service";
import { getRequestDurationMs } from "../observability/requestContext";

interface CreationBody {
  accountId: string;
  maxTime: number;
  assetCode: string;
  baseFee: string;
}

export interface PriceQuery {
  provider: PriceProvider;
  sourceCurrency: Currency;
  targetCurrency: Currency;
  amount: string;
  network?: string;
  direction: RampDirection;
}

interface ChangeOpBody extends CreationBody {
  sequence: string;
  paymentData: unknown;
}

interface SwapBody {
  amountRaw: string;
  address: string;
  token?: keyof TokenConfig;
}

interface SiweCreateBody {
  walletAddress: string;
}

interface SiweValidateBody {
  nonce: string;
  signature: string;
  siweMessage: string;
}

export const validateCreationInput: RequestHandler = (req, res, next) => {
  const { accountId, maxTime, assetCode, baseFee } = req.body as CreationBody;

  if (!accountId || !maxTime) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing accountId or maxTime parameter" });
    return;
  }

  if (!assetCode) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing assetCode parameter" });
    return;
  }

  if (!baseFee) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing baseFee parameter" });
    return;
  }

  if (typeof maxTime !== "number") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "maxTime must be a number" });
    return;
  }
  next();
};

export const validateBundledPriceInput: RequestHandler<unknown, unknown, unknown, PriceQuery> = (req, res, next) => {
  const { sourceCurrency, targetCurrency, amount, network, direction } = req.query;

  if (!direction || !isValidDirection(direction)) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: 'Invalid direction parameter. Must be either "onramp" or "offramp".'
    });
    return;
  }

  // For offramp: source must be crypto, target must be fiat
  // For onramp: source must be fiat, target must be crypto
  const isSell = direction === RampDirection.SELL;

  if (!sourceCurrency || !isValidCurrencyForDirection(sourceCurrency, isSell ? "crypto" : "fiat")) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: `Invalid sourceCurrency for ${direction}. Must be a ${
        isSell ? "cryptocurrency" : "fiat currency"
      }. Supported currencies are: ${isSell ? VALID_CRYPTO_CURRENCIES.join(", ") : VALID_FIAT_CURRENCIES.join(", ")}`
    });
    return;
  }

  if (!targetCurrency || !isValidCurrencyForDirection(targetCurrency, isSell ? "fiat" : "crypto")) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: `Invalid targetCurrency for ${direction}. Must be a ${
        isSell ? "fiat currency" : "cryptocurrency"
      }. Supported currencies are: ${isSell ? VALID_FIAT_CURRENCIES.join(", ") : VALID_CRYPTO_CURRENCIES.join(", ")}`
    });
    return;
  }

  if (!amount) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing amount parameter" });
    return;
  }

  if (!network) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing network parameter" });
    return;
  }

  if (isNaN(parseFloat(amount))) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid amount parameter. Not a number." });
    return;
  }

  next();
};

export const validatePriceInput: RequestHandler<unknown, unknown, unknown, PriceQuery> = (req, res, next) => {
  const { provider, sourceCurrency, targetCurrency, amount, network, direction } = req.query;

  if (!provider || !isValidPriceProvider(provider)) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: `Invalid provider. Supported providers are: ${VALID_PROVIDERS.join(", ")}`
    });
    return;
  }

  if (!direction || !isValidDirection(direction)) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: 'Invalid direction parameter. Must be either "onramp" or "offramp".'
    });
    return;
  }

  // For offramp: source must be crypto, target must be fiat
  // For onramp: source must be fiat, target must be crypto
  const isSell = direction === RampDirection.SELL;

  if (!sourceCurrency || !isValidCurrencyForDirection(sourceCurrency, isSell ? "crypto" : "fiat")) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: `Invalid sourceCurrency for ${direction}. Must be a ${
        isSell ? "cryptocurrency" : "fiat currency"
      }. Supported currencies are: ${isSell ? VALID_CRYPTO_CURRENCIES.join(", ") : VALID_FIAT_CURRENCIES.join(", ")}`
    });
    return;
  }

  if (!targetCurrency || !isValidCurrencyForDirection(targetCurrency, isSell ? "fiat" : "crypto")) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: `Invalid targetCurrency for ${direction}. Must be a ${
        isSell ? "fiat currency" : "cryptocurrency"
      }. Supported currencies are: ${isSell ? VALID_FIAT_CURRENCIES.join(", ") : VALID_CRYPTO_CURRENCIES.join(", ")}`
    });
    return;
  }

  if (!amount) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing amount parameter" });
    return;
  }

  if (!network) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing network parameter" });
    return;
  }

  if (isNaN(parseFloat(amount))) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid amount parameter. Not a number." });
    return;
  }

  next();
};

export const validateChangeOpInput: RequestHandler = (req, res, next) => {
  const { accountId, sequence, paymentData, maxTime, assetCode, baseFee } = req.body as ChangeOpBody;

  if (!accountId || !sequence || !paymentData || !maxTime) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing required parameters" });
    return;
  }

  if (!assetCode) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing assetCode parameter" });
    return;
  }

  if (!baseFee) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing baseFee parameter" });
    return;
  }

  if (typeof sequence !== "string" || typeof maxTime !== "number") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid input types" });
    return;
  }
  next();
};

const validateRequestBodyValuesForTransactionStore = (): RequestHandler => (req, res, next) => {
  const { flowType } = req.body;

  if (!flowType) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing flowType parameter" });
    return;
  }

  if (!FLOW_HEADERS[flowType as keyof typeof FLOW_HEADERS]) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: `Invalid flowType. Supported flowTypes are: ${Object.keys(FLOW_HEADERS).join(", ")}`
    });
    return;
  }

  const requiredRequestBodyKeys = FLOW_HEADERS[flowType as keyof typeof FLOW_HEADERS];

  validateRequestBodyValues(requiredRequestBodyKeys)(req, res, next);
};

const validateRequestBodyValues =
  (requiredRequestBodyKeys: string[]): RequestHandler =>
  (req, res, next) => {
    const data = req.body;

    if (!requiredRequestBodyKeys.every(key => data[key])) {
      const missingItems = requiredRequestBodyKeys.filter(key => !data[key]);
      const errorMessage = `Request body data does not match schema. Missing items: ${missingItems.join(", ")}`;
      logger.error(errorMessage);
      res.status(httpStatus.BAD_REQUEST).json({ error: errorMessage });
      return;
    }

    next();
  };

export const validateStorageInput = validateRequestBodyValuesForTransactionStore();
export const validateContactInput = validateRequestBodyValues(CONTACT_SHEET_HEADER_VALUES);
export const validateEmailInput = validateRequestBodyValues(EMAIL_SHEET_HEADER_VALUES);
export const validateRatingInput = validateRequestBodyValues(RATING_SHEET_HEADER_VALUES);
export const validateExecuteXCM = validateRequestBodyValues(["id", "payload"]);

export const validatePreSwapSubsidizationInput: RequestHandler = (req, res, next) => {
  const { amountRaw, address } = req.body as SwapBody;

  if (amountRaw === undefined) {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing "amountRaw" parameter' });
    return;
  }

  if (typeof amountRaw !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: '"amountRaw" parameter must be a string' });
    return;
  }

  if (address === undefined) {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing "address" parameter' });
    return;
  }

  next();
};

export const validatePostSwapSubsidizationInput: RequestHandler = (req, res, next) => {
  const { amountRaw, address, token } = req.body as Required<SwapBody>;

  if (amountRaw === undefined) {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing "amountRaw" parameter' });
    return;
  }

  if (typeof amountRaw !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: '"amountRaw" parameter must be a string' });
    return;
  }

  if (address === undefined) {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing "address" parameter' });
    return;
  }

  if (token === undefined) {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing "token" parameter' });
    return;
  }

  next();
};

export const validateSiweCreate: RequestHandler = (req, res, next) => {
  const { walletAddress } = req.body as SiweCreateBody;

  if (!walletAddress) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing param: walletAddress" });
    return;
  }
  next();
};

export const validateSiweValidate: RequestHandler = (req, res, next) => {
  const { nonce, signature, siweMessage } = req.body as SiweValidateBody;

  if (!signature) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing param: signature" });
    return;
  }

  if (!nonce) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing param: nonce" });
    return;
  }

  if (!siweMessage) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing param: siweMessage" });
    return;
  }

  next();
};

export const validateSubaccountCreation: RequestHandler = (req, res, next) => {
  const { accountType } = req.body as CreateAveniaSubaccountRequest;

  if (!accountType || !isValidAveniaAccountType(accountType)) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: "Invalid accountType."
    });
    return;
  }

  next();
};

const validateSupportedFiatCurrency = (
  rampType: RampDirection,
  inputCurrency: unknown,
  outputCurrency: unknown,
  res: Response
): boolean => {
  const fiatCurrency = rampType === RampDirection.BUY ? inputCurrency : outputCurrency;
  if (!isSupportedFiatCurrency(fiatCurrency)) {
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.UnsupportedCurrency });
    return false;
  }
  return true;
};

export const validateCreateQuoteInput: RequestHandler<unknown, unknown, CreateQuoteRequest> = (req, res, next) => {
  if (req.body) {
    req.body.inputCurrency = normalizeAxlUsdcCurrency(req.body.inputCurrency) as CreateQuoteRequest["inputCurrency"];
    req.body.outputCurrency = normalizeAxlUsdcCurrency(req.body.outputCurrency) as CreateQuoteRequest["outputCurrency"];
  }

  const { rampType, from, to, inputAmount, inputCurrency, outputCurrency } = req.body;

  if (!rampType || !from || !to || !inputAmount || !inputCurrency || !outputCurrency) {
    observeQuoteValidationFailure(req, "quote_create");
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.MissingRequiredFields });
    return;
  }

  if (rampType !== RampDirection.BUY && rampType !== RampDirection.SELL) {
    observeQuoteValidationFailure(req, "quote_create");
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.InvalidRampType });
    return;
  }

  if (!validateSupportedFiatCurrency(rampType, inputCurrency, outputCurrency, res)) {
    observeQuoteValidationFailure(req, "quote_create");
    return;
  }

  next();
};

export const validateCreateBestQuoteInput: RequestHandler<unknown, unknown, CreateBestQuoteRequest> = (req, res, next) => {
  if (req.body) {
    req.body.inputCurrency = normalizeAxlUsdcCurrency(req.body.inputCurrency) as CreateBestQuoteRequest["inputCurrency"];
    req.body.outputCurrency = normalizeAxlUsdcCurrency(req.body.outputCurrency) as CreateBestQuoteRequest["outputCurrency"];
  }

  const { rampType, from, to, inputAmount, inputCurrency, outputCurrency, networks } = req.body;

  if (!rampType || !inputAmount || !inputCurrency || !outputCurrency) {
    observeQuoteValidationFailure(req, "quote_create_best");
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.MissingRequiredFields });
    return;
  }

  if (rampType !== RampDirection.BUY && rampType !== RampDirection.SELL) {
    observeQuoteValidationFailure(req, "quote_create_best");
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.InvalidRampType });
    return;
  }

  if (rampType === RampDirection.BUY && !from) {
    observeQuoteValidationFailure(req, "quote_create_best");
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.MissingFromField });
    return;
  }

  if (rampType === RampDirection.SELL && !to) {
    observeQuoteValidationFailure(req, "quote_create_best");
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.MissingToField });
    return;
  }

  if (networks !== undefined) {
    if (!Array.isArray(networks)) {
      observeQuoteValidationFailure(req, "quote_create_best");
      res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.InvalidNetworks });
      return;
    }
    const normalized: Networks[] = [];
    for (const entry of networks) {
      if (typeof entry !== "string") {
        observeQuoteValidationFailure(req, "quote_create_best");
        res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.InvalidNetworks });
        return;
      }
      const canonical = getCaseSensitiveNetwork(entry);
      if (!canonical) {
        observeQuoteValidationFailure(req, "quote_create_best");
        res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.InvalidNetworks });
        return;
      }
      normalized.push(canonical);
    }
    req.body.networks = normalized;
  }

  if (!validateSupportedFiatCurrency(rampType, inputCurrency, outputCurrency, res)) {
    observeQuoteValidationFailure(req, "quote_create_best");
    return;
  }

  next();
};

const normalizeAxlUsdcCurrency = (value: unknown): unknown => {
  if (typeof value !== "string") return value;

  return value.toLowerCase() === "axlusdc" ? "USDC.axl" : value;
};

function observeQuoteValidationFailure(
  req: Request<unknown, unknown, CreateQuoteRequest | CreateBestQuoteRequest>,
  operation: "quote_create" | "quote_create_best"
): void {
  observeApiClientEvent({
    durationMs: getRequestDurationMs(req),
    errorType: "validation_error",
    httpStatus: httpStatus.BAD_REQUEST,
    metadata: buildQuoteValidationRequestMetadata(req, operation),
    operation,
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || null
  });
}

function buildQuoteValidationRequestMetadata(
  req: Request<unknown, unknown, CreateQuoteRequest | CreateBestQuoteRequest>,
  operation: "quote_create" | "quote_create_best"
): Record<string, unknown> {
  return buildApiClientRequestMetadata(req, {
    bodyKeys: [
      ...(operation === "quote_create_best" ? ["countryCode", "networks"] : []),
      "from",
      "inputAmount",
      "inputCurrency",
      "outputCurrency",
      "partnerId",
      "rampType",
      "to"
    ]
  });
}

export const validateGetWidgetUrlInput: RequestHandler<unknown, unknown, GetWidgetUrlLocked | GetWidgetUrlRefresh> = (
  req,
  res,
  next
) => {
  if ((req.body as GetWidgetUrlLocked).quoteId) {
    return next();
  }

  const { network, fiat, inputAmount, cryptoLocked, rampType, externalSessionId } = req.body as GetWidgetUrlRefresh;

  if (!network || !fiat || !inputAmount || !cryptoLocked || !rampType || !externalSessionId) {
    res.status(httpStatus.BAD_REQUEST).json({ error: QuoteError.MissingRequiredFields });
    return;
  }

  next();
};

const countryValidators: Record<string, (body: SubmitKycInformationRequest) => string | null> = {
  AR: ({ phoneNumber, cuit, nationalities, pep }) => {
    if (!phoneNumber) return "Phone number is required for Argentina";
    if (!phoneNumber.startsWith("+54")) return "Phone number must use Argentina country code (+54)";
    if (cuit && !/^\d{11}$/.test(cuit)) return "CUIT must be exactly 11 digits";
    if (nationalities && !nationalities.every(n => /^[A-Z]{2}$/.test(n))) return "Nationalities must use alpha-2 country codes";
    if (typeof pep !== "boolean") return "PEP declaration is required for Argentina";
    return null;
  }
};

/**
 * Alfredpay refuses to finalize a KYB submission missing any of these (`110002 "Invalid field(s)"`),
 * and it only says so at `sendKybSubmission` — after the documents have been uploaded. Rejecting the
 * incomplete payload here keeps that failure at the point of entry, and keeps the contract enforced
 * for callers that are not our own KYB wizard. Mirrors GET …/penny/kybRequirements?country=,
 * including its two `requiredIf` branches.
 */
const validateKybQuestionnaire = (body: SubmitKybInformationRequest): string | null => {
  const requiredText: Array<keyof SubmitKybInformationRequest> = [
    "walletAddresses",
    "sourceOfFunds",
    "businessActivities",
    "accountPurpose"
  ];
  for (const field of requiredText) {
    const value = body[field];
    if (typeof value !== "string" || !value.trim()) return `${field} is required`;
  }

  const requiredBooleans: Array<keyof SubmitKybInformationRequest> = [
    "transmitsCustomerFunds",
    "operatesInSanctionedCountries",
    "isRegulatedBusiness"
  ];
  for (const field of requiredBooleans) {
    if (typeof body[field] !== "boolean") return `${field} is required`;
  }

  for (const field of ["expectedMonthlyVolumeUsd", "expectedMonthlyTransactions"] as const) {
    const value = body[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return `${field} must be a non-negative number`;
  }
  if (!Number.isInteger(body.expectedMonthlyTransactions)) return "expectedMonthlyTransactions must be a whole number";

  if (body.transmitsCustomerFunds && typeof body.conductsComplianceScreening !== "boolean") {
    return "conductsComplianceScreening is required when transmitting customer funds";
  }
  if (body.conductsComplianceScreening && !body.complianceScreeningDescription?.trim()) {
    return "complianceScreeningDescription is required when conducting compliance screening";
  }
  return null;
};

export const validateKybSubmission: RequestHandler = (req, res, next) => {
  const error = validateKybQuestionnaire(req.body as SubmitKybInformationRequest);
  if (error) {
    next(new APIError({ errors: [{ message: error }], message: error, status: httpStatus.BAD_REQUEST }));
    return;
  }
  next();
};

export const validateKycSubmission: RequestHandler = (req, res, next) => {
  const body = req.body as SubmitKycInformationRequest;
  const validator = countryValidators[body.country];

  if (!validator) {
    return next();
  }

  const error = validator(body);
  if (error) {
    next(
      new APIError({
        errors: [{ message: error }],
        message: error,
        status: httpStatus.BAD_REQUEST
      })
    );
    return;
  }

  next();
};

export const validateStartKyc2: RequestHandler = (req, res, next) => {
  const { documentType } = req.body as AveniaKYCDataUploadRequest;

  if (!isValidKYCDocType(documentType)) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: "Invalid document type. Document type must be: RG or CNH"
    });
    return;
  }

  next();
};
