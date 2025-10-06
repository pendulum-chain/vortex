import {
  AveniaKYCDataUploadRequest,
  CreateAveniaSubaccountRequest,
  CreateQuoteRequest,
  Currency,
  isValidAveniaAccountType,
  isValidCurrencyForDirection,
  isValidDirection,
  isValidKYCDocType,
  isValidPriceProvider,
  PriceProvider,
  QuoteError,
  RampDirection,
  TokenConfig,
  VALID_CRYPTO_CURRENCIES,
  VALID_FIAT_CURRENCIES,
  VALID_PROVIDERS
} from "@packages/shared";
import { RequestHandler } from "express";
import httpStatus from "http-status";
import { EMAIL_SHEET_HEADER_VALUES } from "../controllers/email.controller";
import { RATING_SHEET_HEADER_VALUES } from "../controllers/rating.controller";
import { FLOW_HEADERS } from "../controllers/storage.controller";

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

interface Sep10Body {
  challengeXDR: string;
  outToken: string;
  clientPublicKey: string;
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
      console.error(errorMessage);
      res.status(httpStatus.BAD_REQUEST).json({ error: errorMessage });
      return;
    }

    next();
  };

export const validateStorageInput = validateRequestBodyValuesForTransactionStore();
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

export const validateSep10Input: RequestHandler = (req, res, next) => {
  const { challengeXDR, outToken, clientPublicKey } = req.body as Sep10Body;

  if (!challengeXDR) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing Anchor challenge: challengeXDR" });
    return;
  }

  if (!outToken) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing offramp token identifier: outToken" });
    return;
  }

  if (!clientPublicKey) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing Stellar ephemeral public key: clientPublicKey" });
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
      error: `Invalid accountType.`
    });
    return;
  }

  next();
};

export const validateCreateQuoteInput: RequestHandler<unknown, unknown, CreateQuoteRequest> = (req, res, next) => {
  const { rampType, from, to, inputAmount, inputCurrency, outputCurrency } = req.body;

  if (!rampType || !from || !to || !inputAmount || !inputCurrency || !outputCurrency) {
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.MissingRequiredFields });
    return;
  }

  if (rampType !== RampDirection.BUY && rampType !== RampDirection.SELL) {
    res.status(httpStatus.BAD_REQUEST).json({ message: QuoteError.InvalidRampType });
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
