const siwe = require('siwe');

// Make constants on config
const scheme = 'https';
const domain = 'localhost';
const origin = 'https://localhost/login';
const statement = 'Please sign the message to login and give me your money';

// Set that will hold the siwe messages sent + nonce we defined
const siweMessageSet = new Set();

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
    expirationTime: new Date().toISOString(),
  });
  const preparedMessage = siweMessage.prepareMessage();
  siweMessageSet.add({ nonce, preparedMessage });

  return preparedMessage;
};

exports.verifySiweMessage = async (messageFromUser, signature) => {
  const fields = await messageFromUser.verify({ signature });
  const expectedSentMessage = { nonce: fields.data.nonce, messageFromUser };

  const isSiweMessage = siweMessageSet.has(expectedSentMessage);
  if (!isSiweMessage) {
    throw new Error('Message not found, we have not send this message or nonce is incorrect.');
  }
  siweMessageSet.delete(expectedSentMessage);

  return fields;
};
