import { RequestHandler } from 'express';
import { ParsedQs } from 'qs';
import { PriceEndpoints } from 'shared/src/endpoints/price.endpoints';
import { TokenConfig } from 'shared';
import { EMAIL_SHEET_HEADER_VALUES } from '../controllers/email.controller';
import { RATING_SHEET_HEADER_VALUES } from '../controllers/rating.controller';
import { FLOW_HEADERS } from '../controllers/storage.controller';
import { RegisterSubaccountPayload, TriggerOfframpRequest } from '../services/brla/types';

import { EvmAddress } from '../services/brla/brlaTeleportService';

interface CreationBody {
  accountId: string;
  maxTime: number;
  assetCode: string;
  baseFee: string;
}

export interface PriceQuery {
  provider: PriceEndpoints.Provider;
  fromCrypto: PriceEndpoints.CryptoCurrency;
  toFiat: PriceEndpoints.FiatCurrency;
  amount: string;
  network?: string;
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

export interface PayInCodeQuery extends ParsedQs {
  taxId: string;
  amount: string;
  receiverAddress: EvmAddress;
}

export const validateCreationInput: RequestHandler = (req, res, next) => {
  const { accountId, maxTime, assetCode, baseFee } = req.body as CreationBody;

  if (!accountId || !maxTime) {
    res.status(400).json({ error: 'Missing accountId or maxTime parameter' });
    return;
  }

  if (!assetCode) {
    res.status(400).json({ error: 'Missing assetCode parameter' });
    return;
  }

  if (!baseFee) {
    res.status(400).json({ error: 'Missing baseFee parameter' });
    return;
  }

  if (typeof maxTime !== 'number') {
    res.status(400).json({ error: 'maxTime must be a number' });
    return;
  }
  next();
};

export const validatePriceInput: RequestHandler<{}, unknown, unknown, PriceQuery> = (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;

  if (!provider || !PriceEndpoints.isValidProvider(provider)) {
    res.status(400).json({
      error: `Invalid provider. Supported providers are: ${PriceEndpoints.VALID_PROVIDERS.join(', ')}`,
    });
    return;
  }

  if (!fromCrypto || !PriceEndpoints.isValidCryptoCurrency(fromCrypto)) {
    res.status(400).json({
      error: `Invalid fromCrypto. Supported currencies are: ${PriceEndpoints.VALID_CRYPTO_CURRENCIES.join(', ')}`,
    });
    return;
  }

  if (!toFiat || !PriceEndpoints.isValidFiatCurrency(toFiat)) {
    res.status(400).json({
      error: `Invalid toFiat. Supported currencies are: ${PriceEndpoints.VALID_FIAT_CURRENCIES.join(', ')}`,
    });
    return;
  }

  if (!amount) {
    res.status(400).json({ error: 'Missing amount parameter' });
    return;
  }

  if (!network) {
    res.status(400).json({ error: 'Missing network parameter' });
    return;
  }

  if (isNaN(parseFloat(amount))) {
    res.status(400).json({ error: 'Invalid amount parameter. Not a number.' });
    return;
  }

  next();
};

export const validateChangeOpInput: RequestHandler = (req, res, next) => {
  const { accountId, sequence, paymentData, maxTime, assetCode, baseFee } = req.body as ChangeOpBody;

  if (!accountId || !sequence || !paymentData || !maxTime) {
    res.status(400).json({ error: 'Missing required parameters' });
    return;
  }

  if (!assetCode) {
    res.status(400).json({ error: 'Missing assetCode parameter' });
    return;
  }

  if (!baseFee) {
    res.status(400).json({ error: 'Missing baseFee parameter' });
    return;
  }

  if (typeof sequence !== 'string' || typeof maxTime !== 'number') {
    res.status(400).json({ error: 'Invalid input types' });
    return;
  }
  next();
};

const validateRequestBodyValuesForTransactionStore = (): RequestHandler => (req, res, next) => {
  const { flowType } = req.body;

  if (!flowType) {
    res.status(400).json({ error: 'Missing flowType parameter' });
    return;
  }

  if (!FLOW_HEADERS[flowType as keyof typeof FLOW_HEADERS]) {
    res.status(400).json({
      error: `Invalid flowType. Supported flowTypes are: ${Object.keys(FLOW_HEADERS).join(', ')}`,
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

    if (!requiredRequestBodyKeys.every((key) => data[key])) {
      const missingItems = requiredRequestBodyKeys.filter((key) => !data[key]);
      const errorMessage = `Request body data does not match schema. Missing items: ${missingItems.join(', ')}`;
      console.error(errorMessage);
      res.status(400).json({ error: errorMessage });
      return;
    }

    next();
  };

export const validateStorageInput = validateRequestBodyValuesForTransactionStore();
export const validateEmailInput = validateRequestBodyValues(EMAIL_SHEET_HEADER_VALUES);
export const validateRatingInput = validateRequestBodyValues(RATING_SHEET_HEADER_VALUES);
export const validateExecuteXCM = validateRequestBodyValues(['id', 'payload']);

export const validatePreSwapSubsidizationInput: RequestHandler = (req, res, next) => {
  const { amountRaw, address } = req.body as SwapBody;

  if (amountRaw === undefined) {
    res.status(400).json({ error: 'Missing "amountRaw" parameter' });
    return;
  }

  if (typeof amountRaw !== 'string') {
    res.status(400).json({ error: '"amountRaw" parameter must be a string' });
    return;
  }

  if (address === undefined) {
    res.status(400).json({ error: 'Missing "address" parameter' });
    return;
  }

  next();
};

export const validatePostSwapSubsidizationInput: RequestHandler = (req, res, next) => {
  const { amountRaw, address, token } = req.body as Required<SwapBody>;

  if (amountRaw === undefined) {
    res.status(400).json({ error: 'Missing "amountRaw" parameter' });
    return;
  }

  if (typeof amountRaw !== 'string') {
    res.status(400).json({ error: '"amountRaw" parameter must be a string' });
    return;
  }

  if (address === undefined) {
    res.status(400).json({ error: 'Missing "address" parameter' });
    return;
  }

  if (token === undefined) {
    res.status(400).json({ error: 'Missing "token" parameter' });
    return;
  }

  next();
};

export const validateSep10Input: RequestHandler = (req, res, next) => {
  const { challengeXDR, outToken, clientPublicKey } = req.body as Sep10Body;

  if (!challengeXDR) {
    res.status(400).json({ error: 'Missing Anchor challenge: challengeXDR' });
    return;
  }

  if (!outToken) {
    res.status(400).json({ error: 'Missing offramp token identifier: outToken' });
    return;
  }

  if (!clientPublicKey) {
    res.status(400).json({ error: 'Missing Stellar ephemeral public key: clientPublicKey' });
    return;
  }
  next();
};

export const validateSiweCreate: RequestHandler = (req, res, next) => {
  const { walletAddress } = req.body as SiweCreateBody;

  if (!walletAddress) {
    res.status(400).json({ error: 'Missing param: walletAddress' });
    return;
  }
  next();
};

export const validateSiweValidate: RequestHandler = (req, res, next) => {
  const { nonce, signature, siweMessage } = req.body as SiweValidateBody;

  if (!signature) {
    res.status(400).json({ error: 'Missing param: signature' });
    return;
  }

  if (!nonce) {
    res.status(400).json({ error: 'Missing param: nonce' });
    return;
  }

  if (!siweMessage) {
    res.status(400).json({ error: 'Missing param: siweMessage' });
    return;
  }

  next();
};

export const validateBrlaTriggerOfframpInput: RequestHandler = (req, res, next) => {
  const { taxId, pixKey, amount, receiverTaxId } = req.body as TriggerOfframpRequest;

  if (!taxId) {
    res.status(400).json({ error: 'Missing taxId parameter' });
    return;
  }

  if (!pixKey) {
    res.status(400).json({ error: 'Missing pixKey parameter' });
    return;
  }

  if (!amount || isNaN(Number(amount))) {
    res.status(400).json({ error: 'Missing or invalid amount parameter' });
    return;
  }

  if (!receiverTaxId) {
    res.status(400).json({ error: 'Missing receiverTaxId parameter' });
    return;
  }

  next();
};

export const validataSubaccountCreation: RequestHandler = (req, res, next) => {
  const { phone, taxIdType, address, fullName, cpf, birthdate, companyName, startDate, cnpj } =
    req.body as RegisterSubaccountPayload;

  if (taxIdType !== 'CPF' && taxIdType !== 'CNPJ') {
    res.status(400).json({ error: 'taxIdType parameter must be either CPF or CNPJ' });
    return;
  }

  if (!cpf) {
    res.status(400).json({
      error: "Missing cpf parameter. If taxIdType is CNPJ, should be a partner's CPF",
    });
    return;
  }

  if (!phone) {
    res.status(400).json({ error: 'Missing phone parameter' });
    return;
  }

  if (!address) {
    res.status(400).json({ error: 'Missing address parameter' });
    return;
  }

  if (!fullName) {
    res.status(400).json({ error: 'Missing fullName parameter' });
    return;
  }

  if (!birthdate) {
    res.status(400).json({ error: 'Missing birthdate parameter' });
    return;
  }

  // CNPJ specific validations
  if (taxIdType === 'CNPJ' && !companyName) {
    res.status(400).json({ error: 'Missing companyName parameter' });
    return;
  }

  if (taxIdType === 'CNPJ' && !startDate) {
    res.status(400).json({ error: 'Missing startDate parameter' });
    return;
  }

  if (taxIdType === 'CNPJ' && !cnpj) {
    res.status(400).json({ error: 'Missing cnpj parameter' });
    return;
  }

  next();
};

export const validateTriggerPayIn: RequestHandler = (req, res, next) => {
  const { taxId, receiverAddress, amount } = req.body;

  if (!taxId) {
    res.status(400).json({ error: 'Missing taxId parameter' });
    return;
  }

  if (!amount || isNaN(Number(amount))) {
    res.status(400).json({ error: 'Missing or invalid amount parameter' });
    return;
  }

  if (!receiverAddress || !receiverAddress.startsWith('0x')) {
    res.status(400).json({
      error: 'Missing or invalid receiverAddress parameter. receiverAddress must be a valid Evm address',
    });
    return;
  }

  next();
};

export const validateGetPayInCode: RequestHandler = (req, res, next) => {
  const { taxId, receiverAddress, amount } = req.query as PayInCodeQuery;

  if (!taxId) {
    res.status(400).json({ error: 'Missing taxId parameter' });
    return;
  }

  if (!amount || isNaN(Number(amount))) {
    res.status(400).json({ error: 'Missing or invalid amount parameter' });
    return;
  }

  if (!receiverAddress || !(receiverAddress as string).startsWith('0x')) {
    res.status(400).json({
      error: 'Missing or invalid receiverAddress parameter. receiverAddress must be a valid Evm address',
    });
    return;
  }

  next();
};
