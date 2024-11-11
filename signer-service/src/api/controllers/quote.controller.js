require('dotenv').config();

const alchemyPayService = require('../services/alchemypay.service');
const transakService = require('../services/transak.service');
const moonpayService = require('../services/moonpay.service');

exports.SUPPORTED_PROVIDERS = ['alchemypay', 'moonpay', 'transak'];

exports.getQuoteForProvider = async (req, res, next) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;
  try {
    switch (provider.toLowerCase()) {
      case 'alchemypay':
        try {
          const alchemyPayQuote = await alchemyPayService.getQuoteFor(fromCrypto, toFiat, amount, network);
          return res.json(alchemyPayQuote);
        } catch (error) {
          // AlchemyPay's errors are not very descriptive, so we just return a generic error message
          return res.status(500).json({ error: 'Could not get quote from AlchemyPay', details: error.message });
        }
      case 'moonpay':
        try {
          const moonpayQuote = await moonpayService.getQuoteFor(fromCrypto, toFiat, amount);
          return res.json(moonpayQuote);
        } catch (error) {
          if (error.message === 'Token not supported') {
            return res.status(404).json({ error: 'Token not supported' });
          }
          return res.status(500).json({ error: 'Could not get quote from Moonpay', details: error.message });
        }
      case 'transak':
        try {
          const transakQuote = await transakService.getQuoteFor(fromCrypto, toFiat, amount, network);
          return res.json(transakQuote);
        } catch (error) {
          if (error.message === 'Token not supported') {
            return res.status(404).json({ error: 'Token not supported' });
          }
          return res.status(500).json({ error: 'Could not get quote from Transak', details: error.message });
        }
      default:
        return res.status(400).json({ error: 'Invalid provider' });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};
