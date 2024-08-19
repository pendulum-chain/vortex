const { fundEphemeralAccount, sendStatusWithPk } = require('../services/pendulum.service');
const { FUNDING_AMOUNT_UNITS, PENDULUM_WSS } = require('../../constants/constants');

exports.fundEphemeralAccountController = async (req, res) => {
    const { ephemeralAddress } = req.body;
  
    if (!ephemeralAddress) {
      return res.status(400).send({ error: 'Invalid request parameters' });
    }
  
    try {
      const result = await fundEphemeralAccount(ephemeralAddress);
      if (result) {
        res.send({ status: 'success' });
      } else {
        res.status(500).send({ error: 'Funding error' });
      }
    } catch (error) {
      console.error('Error funding ephemeral account:', error);
      res.status(500).send({ error: 'Internal Server Error' });
    }
  }

exports.sendStatusWithPk = async (req, res, next) => {
    try {
      const result = await sendStatusWithPk();
      if (!result.status) {
        res.json({ status: false, public: result.public });
      }
  
      res.json({ status: true, public: result.public });
    } catch (error) {
      console.error('Server error:', error);
      return res.status(500).json({ error: 'Server error', details: error.message });
    }
}