const siwe = require('siwe');

// Make constants on config
const scheme = 'https';
const domain = 'localhost';
const origin = 'https://localhost/login';
const statement = 'Please sign the message to login!';

// Set that will hold the siwe messages sent + nonce we defined
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
    chainId: '1',
    nonce,
    expirationTime: new Date(Date.now() + 360 * 60 * 1000).toISOString(),
  });
  const preparedMessage = siweMessage.prepareMessage();
  siweMessagesMap.set(nonce, siweMessage);

  return { siweMessage: preparedMessage, nonce };
};

exports.verifySiweMessage = async (nonce, signature) => {
  const maybeSiweMessage = siweMessagesMap.get(nonce);
  if (!maybeSiweMessage) {
    throw new Error('Message not found, we have not send this message or nonce is incorrect.');
  }
  // TODO DEFINE at some point we need to delete them (?)
  //siweMessagesMap.delete(nonce);

  // Verify the signature and other message fields
  const { data } = await maybeSiweMessage.verify({ signature });

  // Perform additional checks to ensure message integrity
  if (data.nonce !== nonce) {
    throw new Error('Nonce mismatch.');
  }

  if (data.expirationTime && new Date(data.expirationTime) < new Date()) {
    throw new Error('Message has expired.');
  }

  return data;
};

// TODO we need some sort of session log-out.
