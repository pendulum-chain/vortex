const { Keypair } = require('stellar-sdk');
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const Big = require('big.js');
require('dotenv').config();

const { PENDULUM_WSS } = require('../../constants/constants');

const { TOKEN_CONFIG } = require('../../constants/tokenConfig');

const TOKEN_TO_SWAP = 'usdc.axl';

const PENDULUM_FUNDING_SEED = process.env.PENDULUM_FUNDING_SEED;

exports.subsidizePreSwap = async (req, res) => {
  try {
    const { pendulumCurrencyId, maximumSubsidyAmountRaw } = TOKEN_CONFIG[TOKEN_TO_SWAP];

    const { address, amountRaw } = req.body;
    console.log('Subsidize pre swap', address, amountRaw);

    if (Big(amountRaw).gt(Big(maximumSubsidyAmountRaw))) {
      throw new Error('Amount exceeds maximum subsidy amount');
    }

    const keyring = new Keyring({ type: 'sr25519' });
    const fundingAccountKeypair = keyring.addFromUri(PENDULUM_FUNDING_SEED);

    const wsProvider = new WsProvider(PENDULUM_WSS);
    const api = await ApiPromise.create({ provider: wsProvider });
    await api.isReady;

    await api.tx.tokens.transfer(address, pendulumCurrencyId, amountRaw).signAndSend(fundingAccountKeypair);

    return res.status(200).json({ message: 'Subsidy transferred successfully' });
  } catch (error) {
    console.error('Error in subsidizePreSwap::', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};

exports.subsidizePostSwap = async (req, res) => {
  try {
    const { address, amountRaw, token } = req.body;
    console.log('Subsidize post swap', address, amountRaw, token);

    const { assetCode, assetIssuer, maximumSubsidyAmountRaw } = TOKEN_CONFIG[token];

    if (Big(amountRaw).gt(Big(maximumSubsidyAmountRaw))) {
      throw new Error('Amount exceeds maximum subsidy amount');
    }

    const assetIssuerHex = `0x${Keypair.fromPublicKey(assetIssuer).rawPublicKey().toString('hex')}`;
    const pendulumCurrencyId = {
      Stellar: {
        AlphaNum4: { code: assetCode.padEnd(4, '\0'), issuer: assetIssuerHex },
      },
    };

    const keyring = new Keyring({ type: 'sr25519' });
    const fundingAccountKeypair = keyring.addFromUri(PENDULUM_FUNDING_SEED);

    const wsProvider = new WsProvider(PENDULUM_WSS);
    const api = await ApiPromise.create({ provider: wsProvider });
    await api.isReady;

    await api.tx.tokens.transfer(address, pendulumCurrencyId, amountRaw).signAndSend(fundingAccountKeypair);

    return res.status(200).json({ message: 'Subsidy transferred successfully' });
  } catch (error) {
    console.error('Error in subsidizePreSwap::', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};
