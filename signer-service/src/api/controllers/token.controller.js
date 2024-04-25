require('dotenv').config();

const FUNDING_PUBLIC_KEY = process.env.FUNDING_PUBLIC_KEY;
const FUNDING_SECRET = process.env.FUNDING_SECRET;

const { buildCreationStellarTx, buildPaymentAndMergeTx } = require('../services/stellar.service');

exports.createStellarTransaction = async (req, res, next) => {
  try {
    let { signature, sequence } = await buildCreationStellarTx(FUNDING_SECRET, req.body.accountId, req.body.maxTime);
    return res.json({ signature, sequence, success: true, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in createStellarTransaction:', error);
    return res.status(500).json({ error: 'Failed to create transaction', details: error.message });
  }
};

exports.changeOpTransaction = async (req, res, next) => {
  try {
    console.log(req.body);
    let { signature } = await buildPaymentAndMergeTx(
      FUNDING_SECRET,
      req.body.accountId,
      req.body.sequence,
      req.body.paymentData,
      req.body.maxTime,
    );
    return res.json({ signature, success: true, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in changeOpTransaction:', error);
    return res.status(500).json({ error: 'Failed to process transaction', details: error.message });
  }
};
