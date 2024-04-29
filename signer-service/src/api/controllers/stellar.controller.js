require('dotenv').config();

const { Horizon, Keypair} = require('stellar-sdk');
const { HORIZON_URL } = require('../../constants/constants');
const FUNDING_SECRET = process.env.FUNDING_SECRET;

const { buildCreationStellarTx, buildPaymentAndMergeTx } = require('../services/stellar.service');

const horizonServer = new Horizon.Server(HORIZON_URL);
// Derive funding pk
const FUNDING_PUBLIC_KEY= Keypair.fromSecret(FUNDING_SECRET).publicKey();

exports.sendStatusWithPk = async (req, res, next) => {
  try {
    //ensure the fundign account exists
    let account = await horizonServer.loadAccount(FUNDING_PUBLIC_KEY);
    let stellarBalance = account.balances.find((balance) => balance.asset_type === 'native');

    // ensure we have at the very least 2.5 XLM in the account
    if (Number(stellarBalance.balance) < 2.5) {
      return res.json({ status: false, public: FUNDING_PUBLIC_KEY });
    }

    return res.json({ status: true, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};

exports.createStellarTransaction = async (req, res, next) => {
  try {
    let { signature, sequence } = await buildCreationStellarTx(FUNDING_SECRET, req.body.accountId, req.body.maxTime);
    return res.json({ signature, sequence, public: FUNDING_PUBLIC_KEY });
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
    return res.json({ signature, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in changeOpTransaction:', error);
    return res.status(500).json({ error: 'Failed to process transaction', details: error.message });
  }
};
