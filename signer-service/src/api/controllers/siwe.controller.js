const { createAndSendSiweMessage } = require('../services/siwe.service');

exports.sendSiweMessage = async (req, res) => {
  const { walletAddress } = req.body;
  try {
    const siweMessage = await createAndSendSiweMessage(walletAddress);
    return res.json({
      siweMessage,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error while creating siwe message' });
  }
};
