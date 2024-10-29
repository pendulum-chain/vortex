require('dotenv').config();

const alchemyPayService = require('../services/alchemypay.service');
const transakService = require('../services/transak.service');

exports.SUPPORTED_PROVIDERS = ['alchemypay', 'transak'];

exports.getQuoteForProvider = async (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount } = req.query;
  try {
    switch (provider.toLowerCase()) {
      case 'alchemypay':
        const alchemyPayQuote = await alchemyPayService.getQuoteFor(fromCrypto, toFiat, amount);
        return res.json(alchemyPayQuote);
      case 'transak':
        const transakQuote = await transakService.getQuoteFor(fromCrypto, toFiat, amount);
        return res.json(transakQuote);
      default:
        return res.status(400).json({ error: 'Invalid provider' });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};
