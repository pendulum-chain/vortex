const { Keypair } = require('stellar-sdk');
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const Big = require('big.js');

const { PENDULUM_WSS, PENDULUM_FUNDING_SEED } = require('../../constants/constants');

const { TOKEN_CONFIG, getPaddedAssetCode } = require('../../constants/tokenConfig');

exports.subsidizePreSwap = async (req, res) => {
  try {
    const { address, amountRaw, tokenToSubsidize } = req.body;
    console.log('Subsidize pre swap', address, amountRaw, tokenToSubsidize);

    const { pendulumCurrencyId, maximumSubsidyAmountRaw } = TOKEN_CONFIG[tokenToSubsidize.toLowerCase()];

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
        AlphaNum4: { code: getPaddedAssetCode(assetCode), issuer: assetIssuerHex },
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
