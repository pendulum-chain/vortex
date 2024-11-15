const siwe = require('siwe');
const { createPublicClient, http } = require('viem');
const { polygon } = require('viem/chains');
const { DEFAULT_EXPIRATION_TIME_HOURS } = require('../../constants/constants');

// Make constants on config
const scheme = 'https';
const domain = 'satoshipay.io';
const origin = 'https://app.vortexfinance.co';
const statement = 'Please sign the message to login!';

// Map that will hold the siwe messages sent + nonce we defined
const siweMessagesMap = new Map();

exports.createAndSendSiweMessage = async (address) => {
  const nonce = siwe.generateNonce();
  const siweMessage = new siwe.SiweMessage({
    scheme,
    domain,
    address,
    statement,
    uri: origin,
    version: '1',
    chainId: polygon.id,
    nonce,
    expirationTime: new Date(Date.now() + DEFAULT_EXPIRATION_TIME_HOURS * 60 * 60 * 1000).toISOString(), // Constructor in ms.
  });
  const preparedMessage = siweMessage.toMessage();
  siweMessagesMap.set(nonce, { siweMessage, address });

  return { siweMessage: preparedMessage, nonce };
};

exports.verifySiweMessage = async (nonce, signature) => {
  const maybeSiweData = siweMessagesMap.get(nonce);
  if (!maybeSiweData) {
    throw new Error('Message not found, we have not send this message or nonce is incorrect.');
  }

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(),
  });

  const valid = await publicClient.verifyMessage({
    address: maybeSiweData.address,
    message: maybeSiweData.siweMessage.toMessage(),
    signature,
  });

  if (!valid) {
    throw new Error('Invalid signature.');
  }

  // Perform additional checks to ensure message integrity
  if (maybeSiweData.siweMessage.nonce !== nonce) {
    throw new Error('Nonce mismatch.');
  }

  if (maybeSiweData.expirationTime && new Date(maybeSiweData.expirationTime) < new Date()) {
    throw new Error('Message has expired.');
  }

  // Successful verification, remove messages with same address
  // from map except for the one we just verified.
  siweMessagesMap.forEach((data, nonce) => {
    if (data.address === maybeSiweData.address && nonce !== maybeSiweData.siweMessage.nonce) {
      siweMessagesMap.delete(nonce);
    }
  });

  return maybeSiweData.siweMessage;
};

// TODO we need some sort of session log-out.
