const { TOKEN_CONFIG } = require('../../constants/tokenConfig');
const { DUMP_SHEET_HEADER_VALUES } = require('../controllers/storage.controller');
const { EMAIL_SHEET_HEADER_VALUES } = require('../controllers/email.controller');
const { RATING_SHEET_HEADER_VALUES } = require('../controllers/rating.controller');
const {
  SUPPORTED_PROVIDERS,
  SUPPORTED_CRYPTO_CURRENCIES,
  SUPPORTED_FIAT_CURRENCIES,
} = require('../controllers/quote.controller');

const validateCreationInput = (req, res, next) => {
  const { accountId, maxTime, assetCode, baseFee } = req.body;
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

const validateQuoteInput = (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;

  if (!provider || SUPPORTED_PROVIDERS.indexOf(provider.toLowerCase()) === -1) {
    return res
      .status(400)
      .json({ error: 'Invalid provider. Supported providers are: ' + SUPPORTED_PROVIDERS.join(', ') });
  }

  if (!fromCrypto || SUPPORTED_CRYPTO_CURRENCIES.indexOf(fromCrypto.toLowerCase()) === -1) {
    return res
      .status(400)
      .json({ error: 'Invalid fromCrypto. Supported currencies are: ' + SUPPORTED_CRYPTO_CURRENCIES.join(', ') });
  }

  if (!toFiat || SUPPORTED_FIAT_CURRENCIES.indexOf(toFiat.toLowerCase()) === -1) {
    return res
      .status(400)
      .json({ error: 'Invalid toFiat. Supported currencies are: ' + SUPPORTED_FIAT_CURRENCIES.join(', ') });
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

const validateChangeOpInput = (req, res, next) => {
  const { accountId, sequence, paymentData, maxTime, assetCode, baseFee } = req.body;
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

const validateRequestBodyValues = (requiredRequestBodyKeys) => (req, res, next) => {
  const data = req.body;

  if (!requiredRequestBodyKeys.every((key) => data[key])) {
    const missingItems = requiredRequestBodyKeys.filter((key) => !data[key]);
    const errorMessage = 'Request body data does not match schema. Missing items: ' + missingItems.join(', ');
    console.error(errorMessage);
    return res.status(400).json({ error: errorMessage });
  }

  next();
};

const validateStorageInput = validateRequestBodyValues(DUMP_SHEET_HEADER_VALUES);
const validateEmailInput = validateRequestBodyValues(EMAIL_SHEET_HEADER_VALUES);
const validateRatingInput = validateRequestBodyValues(RATING_SHEET_HEADER_VALUES);
const validateExecuteXCM = validateRequestBodyValues(['id', 'payload']);

const validatePreSwapSubsidizationInput = (req, res, next) => {
  const { amountRaw, address } = req.body;

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

const validatePostSwapSubsidizationInput = (req, res, next) => {
  const { amountRaw, address, token } = req.body;

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
  if (tokenConfig === undefined || tokenConfig.assetCode === undefined || tokenConfig.assetIssuer === undefined) {
    return res.status(400).json({ error: 'Invalid "token" parameter' });
  }

  next();
};

const validateSep10Input = (req, res, next) => {
  const { challengeXDR, outToken, clientPublicKey } = req.body;
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

const validateSiweCreate = (req, res, next) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing param: walletAddress' });
  }
  next();
};

const validateSiweValidate = (req, res, next) => {
  const { nonce, signature, siweMessage } = req.body;
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

module.exports = {
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
