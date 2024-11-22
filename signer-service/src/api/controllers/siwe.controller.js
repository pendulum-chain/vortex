const { createAndSendNonce, verifyAndStoreSiweMessage } = require('../services/siwe.service');
const { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } = require('../../constants/constants');

exports.sendSiweMessage = async (req, res) => {
  const { walletAddress } = req.body;
  try {
    const { nonce } = await createAndSendNonce(walletAddress);
    return res.json({
      nonce,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error while generating nonce' });
  }
};

exports.validateSiweSignature = async (req, res) => {
  const { nonce, signature, siweMessage } = req.body;
  try {
    await verifyAndStoreSiweMessage(nonce, signature, siweMessage);

    const token = {
      nonce,
      signature,
    };

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: DEFAULT_LOGIN_EXPIRATION_TIME_HOURS * 60 * 60 * 1000,
    });

    return res.status(200).json({ message: 'Signature is valid' });
  } catch (e) {
    console.error(e);

    if (e.name === 'SiweValidationError') {
      return res.status(401).json({ error: `Siwe validation error: ${e.message}` });
    }

    return res.status(500).json({ error: `Could not validate signature: ${e.message}` });
  }
};
