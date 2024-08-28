const { TOKEN_CONFIG } = require('../../constants/tokenConfig');
const { SHEET_HEADER_VALUES } = require('../controllers/storage.controller');
const { EMAIL_SHEET_HEADER_VALUES } = require('../controllers/email.controller');

const validateCreationInput = (req, res, next) => {
  const { accountId, maxTime, assetCode } = req.body;
  if (!accountId || !maxTime) {
    return res.status(400).json({ error: 'Missing accountId or maxTime parameter' });
  }

  if (!assetCode) {
    return res.status(400).json({ error: 'Missing assetCode parameter' });
  }

  if (typeof maxTime !== 'number') {
    return res.status(400).json({ error: 'maxTime must be a number' });
  }
  next();
};

const validateChangeOpInput = (req, res, next) => {
  const { accountId, sequence, paymentData, maxTime, assetCode } = req.body;
  if (!accountId || !sequence || !paymentData || !maxTime) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!assetCode) {
    return res.status(400).json({ error: 'Missing assetCode parameter' });
  }

  if (typeof sequence !== 'string' || typeof maxTime !== 'number') {
    return res.status(400).json({ error: 'Invalid input types' });
  }
  next();
};

const validateInputHeaderValues = (requiredHeaders) => (req, res, next) => {
  const data = req.body;

  if (!requiredHeaders.every((header) => data[header])) {
    const missingItems = requiredHeaders.filter((header) => !data[header]);
    const errorMessage = 'Data does not match schema. Missing items: ' + missingItems.join(', ');
    console.error(errorMessage);
    return res.status(400).json({ error: errorMessage });
  }

  next();
};

const validateStorageInput = validateInputHeaderValues(SHEET_HEADER_VALUES);
const validateEmailInput = validateInputHeaderValues(EMAIL_SHEET_HEADER_VALUES);

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

module.exports = {
  validateChangeOpInput,
  validateCreationInput,
  validatePreSwapSubsidizationInput,
  validatePostSwapSubsidizationInput,
  validateStorageInput,
  validateEmailInput,
};
