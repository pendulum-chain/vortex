const { createAndSendSiweMessage, verifySiweMessage } = require('../services/siwe.service');
const { DEFAULT_EXPIRATION_TIME_HOURS } = require('../../constants/constants');

exports.sendSiweMessage = async (req, res) => {
  const { walletAddress } = req.body;
  try {
    const { siweMessage, nonce } = await createAndSendSiweMessage(walletAddress);
    return res.json({
      siweMessage,
      nonce,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error while creating siwe message' });
  }
};

exports.validateSiweSignature = async (req, res) => {
  const { nonce, signature } = req.body;
  try {
    await verifySiweMessage(nonce, signature);

    const token = {
      nonce,
      signature,
    };

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: false, // TODO TODO TODO: Change to true in production
      sameSite: 'Strict',
      maxAge: DEFAULT_EXPIRATION_TIME_HOURS * 60 * 60 * 1000,
    });

    return res.status(200).json({ message: 'Signature is valid' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not validate signature' });
  }
};
