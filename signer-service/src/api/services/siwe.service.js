const siwe = require('siwe');
const { createPublicClient, http } = require('viem');
const { polygon } = require('viem/chains');
const {
  DEFAULT_LOGIN_EXPIRATION_TIME_HOURS,
  VALID_SIWE_DOMAINS,
  VALID_SIWE_CHAINS,
  VALID_SIWE_LOGIN_ORIGINS,
} = require('../../constants/constants');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SiweValidationError';
  }
}

// Map that will hold the siwe messages sent + nonce we defined
const siweMessagesMap = new Map();

const createAndSendNonce = async (address) => {
  const nonce = siwe.generateNonce();
  const siweMessage = undefined; // Initial message is undefined since it will be created in UI.
  siweMessagesMap.set(nonce, { siweMessage, address });
  return { nonce };
};

// Used to verify the integrity and validity of the signature
// For the initial verification, the siweMessage must be provided as parameter
const verifySiweMessage = async (nonce, signature, initialSiweMessage) => {
  const maybeSiweData = siweMessagesMap.get(nonce);
  if (!maybeSiweData) {
    throw new ValidationError('Message not found, we have not sent this nonce or nonce is incorrect');
  }

  const siweMessage = maybeSiweData.siweMessage ? maybeSiweData.siweMessage : new siwe.SiweMessage(initialSiweMessage);
  const address = maybeSiweData.address;

  if (!siweMessage) {
    throw new Error('Message must be provided as a parameter if it has not been initially validated.');
  }

  // Verify the integrity of the message
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(),
  });

  const valid = await publicClient.verifyMessage({
    address: address,
    message: siweMessage.toMessage(), // Validation must be done on the message as string
    signature,
  });

  if (!valid) {
    throw new ValidationError('Invalid signature');
  }

  // Perform additional checks to ensure message fields
  if (siweMessage.nonce !== nonce) {
    throw new ValidationError('Nonce mismatch');
  }

  if (siweMessage.expirationTime && new Date(siweMessage.expirationTime) < new Date()) {
    throw new ValidationError('Message has expired');
  }

  return siweMessage;
};

// Since the message is created in the UI, we need to verify the fields of the message
const verifyMessageFields = (siweMessage) => {
  // Fields we validate on initial
  const domain = siweMessage.domain;
  const uri = siweMessage.uri;
  const scheme = siweMessage.scheme; // must be https
  const chainId = siweMessage.chainId;
  const expirationTime = siweMessage.expirationTime;

  if (!VALID_SIWE_LOGIN_ORIGINS.includes(uri)) {
    throw new ValidationError('Origin not in the list of allowed origins');
  }

  if (!VALID_SIWE_DOMAINS.includes(domain)) {
    throw new ValidationError('Incorrect domain');
  }

  if (!VALID_SIWE_CHAINS.includes(chainId)) {
    throw new ValidationError('Incorrect chain ID');
  }

  if (scheme !== 'https') {
    throw new ValidationError('Scheme must be https');
  }

  // Check if expiration is within a reasonable range from current time
  const currentTime = new Date().getTime();
  const expirationTimestamp = new Date(expirationTime).getTime();

  const expirationGracePeriod = 1000 * 60; // 1 minute
  const expirationPeriodMs = DEFAULT_LOGIN_EXPIRATION_TIME_HOURS * 60 * 60 * 1000;
  const expectedMinExpirationTimestamp = currentTime + expirationPeriodMs - expirationGracePeriod;
  const expectedMaxExpirationTimestamp = currentTime + expirationPeriodMs;

  if (expirationTimestamp < expectedMinExpirationTimestamp) {
    throw new ValidationError('Expiration time is too low');
  }

  if (expirationTimestamp > expectedMaxExpirationTimestamp) {
    throw new ValidationError('Expiration time is too high');
  }
};

const initialVerifySiweMessage = async (nonce, signature, siweMessage) => {
  const validatedMessage = await verifySiweMessage(nonce, signature, siweMessage);

  // Perform additional checks to ensure message fields are valid
  verifyMessageFields(validatedMessage);

  // Verification complete. Update the map and append the message.
  const siweData = siweMessagesMap.get(nonce);
  siweData.siweMessage = validatedMessage;
  siweMessagesMap.set(nonce, siweData);

  // Remove messages with same address from map except for the one we just verified.
  // This will keep one valid session per address.
  siweMessagesMap.forEach((data, nonce) => {
    if (data.address === siweData.address && nonce !== siweData.siweMessage.nonce) {
      siweMessagesMap.delete(nonce);
    }
  });
};

module.exports = { verifySiweMessage, initialVerifySiweMessage, createAndSendNonce };
