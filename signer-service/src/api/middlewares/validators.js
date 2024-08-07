const { SHEET_HEADER_VALUES } = require('../controllers/storage.controller');

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

const validateStorageInput = (req, res, next) => {
  const data = req.body;
  // Check if the data contains values for all the headers
  if (!SHEET_HEADER_VALUES.every((header) => data[header])) {
    const missingItems = SHEET_HEADER_VALUES.filter((header) => !data[header]);
    let errorMessage = 'Data does not match schema. Missing items: ' + missingItems.join(', ');
    console.error(errorMessage);
    return res.status(400).json({ error: errorMessage });
  }

  next();
};

module.exports = { validateChangeOpInput, validateCreationInput, validateStorageInput };
