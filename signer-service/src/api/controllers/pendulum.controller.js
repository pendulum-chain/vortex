const { fundEphemeralAccount } = require('../services/pendulum.service');

exports.fundEphemeralAccountController = async (req, res) => {
    const { ephemeralAddress } = req.body;
  
    if (!ephemeralAddress) {
      return res.status(400).send({ error: 'Invalid request parameters' });
    }
  
    try {
      //ephemeralAddressHardcoded = '6d5WXK5jwPeKm5bHKMeyUtRnqphyXogbeEW38hYfeiQUTjqb';
      const result = await fundEphemeralAccount(ephemeralAddress);
      if (result) {
        res.send({ status: 'success' });
      } else {
        res.status(500).send({ error: 'Funding or input token arrival timed out' });
      }
    } catch (error) {
      console.error('Error funding ephemeral account:', error);
      res.status(500).send({ error: 'Internal Server Error' });
    }
  }