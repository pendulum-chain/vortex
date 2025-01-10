import { Request, Response, NextFunction, RequestHandler } from 'express';
import { isStellarTokenConfig, TOKEN_CONFIG, TokenConfig } from '../../constants/tokenConfig';
import { EMAIL_SHEET_HEADER_VALUES } from '../controllers/email.controller';
import { RATING_SHEET_HEADER_VALUES } from '../controllers/rating.controller';
import { DUMP_SHEET_HEADER_VALUES_ASSETHUB, DUMP_SHEET_HEADER_VALUES_EVM } from '../controllers/storage.controller';
import {
  SUPPORTED_PROVIDERS,
  SUPPORTED_CRYPTO_CURRENCIES,
  SUPPORTED_FIAT_CURRENCIES,
  Provider,
  FiatCurrency,
  CryptoCurrency,
} from '../controllers/quote.controller';

interface CreationBody {
  accountId: string;
  maxTime: number;
  assetCode: string;
  baseFee: string;
}

interface QuoteQuery {
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

const validateCreationInput: RequestHandler = async (req, res, next) => {
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

const validateQuoteInput: RequestHandler = async (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query as unknown as QuoteQuery;

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

const validateChangeOpInput: RequestHandler = async (req, res, next) => {
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

const validateRequestBodyValuesForTransactionStore = (): RequestHandler => async (req, res, next) => {
  const { offramperAddress } = req.body;

  if (!offramperAddress) {
    res.status(400).json({ error: 'Missing offramperAddress parameter' });
    return;
  }

  const requiredRequestBodyKeys = offramperAddress.includes('0x')
    ? DUMP_SHEET_HEADER_VALUES_EVM
    : DUMP_SHEET_HEADER_VALUES_ASSETHUB;

  validateRequestBodyValues(requiredRequestBodyKeys)(req, res, next);
};

const validateRequestBodyValues =
  (requiredRequestBodyKeys: string[]): RequestHandler =>
  async (req, res, next) => {
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

const validateStorageInput = validateRequestBodyValuesForTransactionStore();
const validateEmailInput = validateRequestBodyValues(EMAIL_SHEET_HEADER_VALUES);
const validateRatingInput = validateRequestBodyValues(RATING_SHEET_HEADER_VALUES);
const validateExecuteXCM = validateRequestBodyValues(['id', 'payload']);

const validatePreSwapSubsidizationInput: RequestHandler = async (req, res, next) => {
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

const validatePostSwapSubsidizationInput: RequestHandler = async (req, res, next) => {
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

  const tokenConfig = TOKEN_CONFIG[token];
  if (!isStellarTokenConfig(tokenConfig)) {
    res.status(400).json({ error: 'Invalid "token" parameter - must be a Stellar token' });
    return;
  }

  next();
};

const validateSep10Input: RequestHandler = async (req, res, next) => {
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

const validateSiweCreate: RequestHandler = async (req, res, next) => {
  const { walletAddress } = req.body as SiweCreateBody;

  if (!walletAddress) {
    res.status(400).json({ error: 'Missing param: walletAddress' });
    return;
  }
  next();
};

const validateSiweValidate: RequestHandler = async (req, res, next) => {
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

export {
  validateChangeOpInput,
  validateQuoteInput,
  validateCreationInput,
  validatePreSwapSubsidizationInput,
  validatePostSwapSubsidizationInput,
  validateStorageInput,
  validateEmailInput,
  validateRatingInput,
  validateExecuteXCM,
  validateSep10Input,
  validateSiweCreate,
  validateSiweValidate,
};
