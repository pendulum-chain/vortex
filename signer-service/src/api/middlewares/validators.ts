import { RequestHandler } from 'express';
import { isStellarTokenConfig, TOKEN_CONFIG, TokenConfig } from '../../constants/tokenConfig';
import { EMAIL_SHEET_HEADER_VALUES } from '../controllers/email.controller';
import { RATING_SHEET_HEADER_VALUES } from '../controllers/rating.controller';
import {
  DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR,
  DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA,
  DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR,
} from '../controllers/storage.controller';
import {
  SUPPORTED_PROVIDERS,
  SUPPORTED_CRYPTO_CURRENCIES,
  SUPPORTED_FIAT_CURRENCIES,
  Provider,
  FiatCurrency,
  CryptoCurrency,
} from '../controllers/quote.controller';
import { RegisterSubaccountPayload, TriggerOfframpRequest } from '../services/brla/types';

interface CreationBody {
  accountId: string;
  maxTime: number;
  assetCode: string;
  baseFee: string;
}

export interface QuoteQuery {
  provider: Provider;
  fromCrypto: CryptoCurrency;
  toFiat: FiatCurrency;
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

export const validateQuoteInput: RequestHandler<{}, unknown, unknown, QuoteQuery> = (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider.toLowerCase() as Provider)) {
    res.status(400).json({ error: `Invalid provider. Supported providers are: ${SUPPORTED_PROVIDERS.join(', ')}` });
    return;
  }

  if (!fromCrypto || !SUPPORTED_CRYPTO_CURRENCIES.includes(fromCrypto.toLowerCase() as CryptoCurrency)) {
    res
      .status(400)
      .json({ error: `Invalid fromCrypto. Supported currencies are: ${SUPPORTED_CRYPTO_CURRENCIES.join(', ')}` });
    return;
  }

  if (!toFiat || !SUPPORTED_FIAT_CURRENCIES.includes(toFiat.toLowerCase() as FiatCurrency)) {
    res
      .status(400)
      .json({ error: `Invalid toFiat. Supported currencies are: ${SUPPORTED_FIAT_CURRENCIES.join(', ')}` });
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
  const { offramperAddress } = req.body;

  if (!offramperAddress) {
    res.status(400).json({ error: 'Missing offramperAddress parameter' });
    return;
  }

  const requiredRequestBodyKeys = offramperAddress.includes('0x')
    ? req.body.stellarEphemeralPublicKey
      ? DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR
      : DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA
    : req.body.stellarEphemeralPublicKey
    ? DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR
    : DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA;

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
    res.status(400).json({ error: "Missing cpf parameter. If taxIdType is CNPJ, should be a partner's CPF" });
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
