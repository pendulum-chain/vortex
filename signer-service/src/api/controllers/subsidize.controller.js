const { Horizon, Keypair } = require('stellar-sdk');
const { HORIZON_URL } = require('../../constants/constants');
const FUNDING_SECRET = process.env.FUNDING_SECRET;

const { buildCreationStellarTx, buildPaymentAndMergeTx } = require('../services/stellar.service');

const horizonServer = new Horizon.Server(HORIZON_URL);
// Derive funding pk
const FUNDING_PUBLIC_KEY = Keypair.fromSecret(FUNDING_SECRET).publicKey();

exports.subsidizePreSwap = async (req, res, next) => {
  try {
    const wsProvider = new WsProvider(websocketUrl);
    const api = await ApiPromise.create({ provider: wsProvider });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};

exports.subsidizePostSwap = async (req, res, next) => {
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
