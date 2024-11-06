require('dotenv').config();

const { Keypair } = require('stellar-sdk');
const { FUNDING_SECRET, SEP10_MASTER_SECRET } = require('../../constants/constants');

const { buildCreationStellarTx, buildPaymentAndMergeTx, sendStatusWithPk } = require('../services/stellar.service');
const { signSep10Challenge } = require('../services/sep10.service');

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

exports.signSep10Challenge = async (req, res, next) => {
  try {
    let { masterSignature, masterPublic } = await signSep10Challenge(req.body.challengeXDR, req.body.outToken);
    return res.json({ masterSignature, masterPublic });
  } catch (error) {
    console.error('Error in signSep10Challenge:', error);
    return res.status(500).json({ error: 'Failed to sign challenge', details: error.message });
  }
};

exports.getSep10MasterPK = async (req, res, next) => {
  try {
    const masterSep10Public = Keypair.fromSecret(SEP10_MASTER_SECRET).publicKey();
    return res.json({ masterSep10Public });
  } catch (error) {
    console.error('Error in signSep10Challenge:', error);
    return res.status(500).json({ error: 'Failed to sign challenge', details: error.message });
  }
};
