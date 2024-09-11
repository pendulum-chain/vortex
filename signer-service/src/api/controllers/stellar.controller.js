require('dotenv').config();

const { Keypair } = require('stellar-sdk');
const { FUNDING_SECRET} = require('../../constants/constants');

const { buildCreationStellarTx, buildPaymentAndMergeTx, sendStatusWithPk } = require('../services/stellar.service');

// Derive funding pk
const FUNDING_PUBLIC_KEY = Keypair.fromSecret(FUNDING_SECRET).publicKey();

exports.sendStatusWithPk = async (req, res, next) => {
  try {
    const result = await sendStatusWithPk();

    return res.json(result);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};

exports.createStellarTransaction = async (req, res, next) => {
  try {
    let { signature, sequence } = await buildCreationStellarTx(
      FUNDING_SECRET,
      req.body.accountId,
      req.body.maxTime,
      req.body.assetCode,
    );
    return res.json({ signature, sequence, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in createStellarTransaction:', error);
    return res.status(500).json({ error: 'Failed to create transaction', details: error.message });
  }
};

exports.changeOpTransaction = async (req, res, next) => {
  try {
    let { signature } = await buildPaymentAndMergeTx(
      FUNDING_SECRET,
      req.body.accountId,
      req.body.sequence,
      req.body.paymentData,
      req.body.maxTime,
      req.body.assetCode,
    );
    return res.json({ signature, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in changeOpTransaction:', error);
    return res.status(500).json({ error: 'Failed to process transaction', details: error.message });
  }
};
