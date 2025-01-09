import { Request, Response, NextFunction } from 'express';
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

type ValidatorFn = (req: Request, res: Response, next: NextFunction) => void | Response;

const validateCreationInput: ValidatorFn = (req, res, next) => {
  const { accountId, maxTime, assetCode, baseFee } = req.body as CreationBody;

  if (!accountId || !maxTime) {
    return res.status(400).json({ error: 'Missing accountId or maxTime parameter' });
  }

  if (!assetCode) {
    return res.status(400).json({ error: 'Missing assetCode parameter' });
  }

  if (!baseFee) {
    return res.status(400).json({ error: 'Missing baseFee parameter' });
  }

  if (typeof maxTime !== 'number') {
    return res.status(400).json({ error: 'maxTime must be a number' });
  }
  next();
};

const validateQuoteInput: ValidatorFn = (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query as unknown as QuoteQuery;

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider.toLowerCase() as Provider)) {
    return res
      .status(400)
      .json({ error: `Invalid provider. Supported providers are: ${SUPPORTED_PROVIDERS.join(', ')}` });
  }

  if (!fromCrypto || !SUPPORTED_CRYPTO_CURRENCIES.includes(fromCrypto.toLowerCase() as CryptoCurrency)) {
    return res
      .status(400)
      .json({ error: `Invalid fromCrypto. Supported currencies are: ${SUPPORTED_CRYPTO_CURRENCIES.join(', ')}` });
  }

  if (!toFiat || !SUPPORTED_FIAT_CURRENCIES.includes(toFiat.toLowerCase() as FiatCurrency)) {
    return res
      .status(400)
      .json({ error: `Invalid toFiat. Supported currencies are: ${SUPPORTED_FIAT_CURRENCIES.join(', ')}` });
  }

  if (!amount) {
    return res.status(400).json({ error: 'Missing amount parameter' });
  }

  if (!network) {
    return res.status(400).json({ error: 'Missing network parameter' });
  }

  if (isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'Invalid amount parameter. Not a number.' });
  }

  next();
};

const validateChangeOpInput: ValidatorFn = (req, res, next) => {
  const { accountId, sequence, paymentData, maxTime, assetCode, baseFee } = req.body as ChangeOpBody;

  if (!accountId || !sequence || !paymentData || !maxTime) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!assetCode) {
    return res.status(400).json({ error: 'Missing assetCode parameter' });
  }

  if (!baseFee) {
    return res.status(400).json({ error: 'Missing baseFee parameter' });
  }

  if (typeof sequence !== 'string' || typeof maxTime !== 'number') {
    return res.status(400).json({ error: 'Invalid input types' });
  }
  next();
};

const validateRequestBodyValuesForTransactionStore = (): ValidatorFn => (req, res, next) => {
  const { offramperAddress } = req.body;

  if (!offramperAddress) {
    return res.status(400).json({ error: 'Missing offramperAddress parameter' });
  }

  const requiredRequestBodyKeys = offramperAddress.includes('0x')
    ? DUMP_SHEET_HEADER_VALUES_EVM
    : DUMP_SHEET_HEADER_VALUES_ASSETHUB;

  validateRequestBodyValues(requiredRequestBodyKeys)(req, res, next);
};

const validateRequestBodyValues =
  (requiredRequestBodyKeys: string[]): ValidatorFn =>
  (req, res, next) => {
    const data = req.body;

    if (!requiredRequestBodyKeys.every((key) => data[key])) {
      const missingItems = requiredRequestBodyKeys.filter((key) => !data[key]);
      const errorMessage = `Request body data does not match schema. Missing items: ${missingItems.join(', ')}`;
      console.error(errorMessage);
      return res.status(400).json({ error: errorMessage });
    }

    next();
  };

const validateStorageInput = validateRequestBodyValuesForTransactionStore();
const validateEmailInput = validateRequestBodyValues(EMAIL_SHEET_HEADER_VALUES);
const validateRatingInput = validateRequestBodyValues(RATING_SHEET_HEADER_VALUES);
const validateExecuteXCM = validateRequestBodyValues(['id', 'payload']);

const validatePreSwapSubsidizationInput: ValidatorFn = (req, res, next) => {
  const { amountRaw, address } = req.body as SwapBody;

  if (amountRaw === undefined) {
    return res.status(400).json({ error: 'Missing "amountRaw" parameter' });
  }

  if (typeof amountRaw !== 'string') {
    return res.status(400).json({ error: '"amountRaw" parameter must be a string' });
  }

  if (address === undefined) {
    return res.status(400).json({ error: 'Missing "address" parameter' });
  }

  next();
};

const validatePostSwapSubsidizationInput: ValidatorFn = (req, res, next) => {
  const { amountRaw, address, token } = req.body as Required<SwapBody>;

  if (amountRaw === undefined) {
    return res.status(400).json({ error: 'Missing "amountRaw" parameter' });
  }

  if (typeof amountRaw !== 'string') {
    return res.status(400).json({ error: '"amountRaw" parameter must be a string' });
  }

  if (address === undefined) {
    return res.status(400).json({ error: 'Missing "address" parameter' });
  }

  if (token === undefined) {
    return res.status(400).json({ error: 'Missing "token" parameter' });
  }

  const tokenConfig = TOKEN_CONFIG[token];
  if (!isStellarTokenConfig(tokenConfig)) {
    return res.status(400).json({ error: 'Invalid "token" parameter - must be a Stellar token' });
  }

  next();
};

const validateSep10Input: ValidatorFn = (req, res, next) => {
  const { challengeXDR, outToken, clientPublicKey } = req.body as Sep10Body;

  if (!challengeXDR) {
    return res.status(400).json({ error: 'Missing Anchor challenge: challengeXDR' });
  }

  if (!outToken) {
    return res.status(400).json({ error: 'Missing offramp token identifier: outToken' });
  }

  if (!clientPublicKey) {
    return res.status(400).json({ error: 'Missing Stellar ephemeral public key: clientPublicKey' });
  }
  next();
};

const validateSiweCreate: ValidatorFn = (req, res, next) => {
  const { walletAddress } = req.body as SiweCreateBody;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing param: walletAddress' });
  }
  next();
};

const validateSiweValidate: ValidatorFn = (req, res, next) => {
  const { nonce, signature, siweMessage } = req.body as SiweValidateBody;

  if (!signature) {
    return res.status(400).json({ error: 'Missing param: signature' });
  }

  if (!nonce) {
    return res.status(400).json({ error: 'Missing param: nonce' });
  }

  if (!siweMessage) {
    return res.status(400).json({ error: 'Missing param: siweMessage' });
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
