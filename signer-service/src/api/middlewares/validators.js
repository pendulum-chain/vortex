const validateCreationInput = (req, res, next) => {
  const { accountId, maxTime } = req.body;
  if (!accountId || !maxTime) {
    return res.status(400).json({ error: 'Missing accountId or maxTime parameter' });
  }
  if (typeof maxTime !== 'number') {
    return res.status(400).json({ error: 'maxTime must be a number' });
  }
  next();
};

const validateChangeOpInput = (req, res, next) => {
  const { accountId, sequence, paymentData, maxTime } = req.body;
  if (!accountId || !sequence || !paymentData || !maxTime) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  if (typeof sequence !== 'string' || typeof maxTime !== 'number') {
    return res.status(400).json({ error: 'Invalid input types' });
  }
  next();
};

module.exports = { validateChangeOpInput, validateCreationInput };
