const siwe = require('siwe');
const { createPublicClient, http } = require('viem');
const { polygon } = require('viem/chains');
const { Keyring } = require('@polkadot/api');
const { SignInMessage } = require('../helpers/siweMessageFormatter.js');
const { signatureVerify } = require('@polkadot/util-crypto');
const { deriveMemoFromAddress } = require('../helpers/memoDerivation');
const { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } = require('../../constants/constants');

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
  const existingSiweDataForNonce = siweMessagesMap.get(nonce);
  if (!existingSiweDataForNonce) {
    throw new ValidationError('Message not found, we have not sent this nonce or nonce is incorrect');
  }

  const siweMessage = existingSiweDataForNonce.siweMessage
    ? existingSiweDataForNonce.siweMessage
    : SignInMessage.fromMessage(initialSiweMessage);
  const address = existingSiweDataForNonce.address;

  if (!siweMessage) {
    throw new Error('Message must be provided as a parameter if it has not been initially validated.');
  }

  // verify with substrate (generic) or evm generic (using polygon public client)
  let valid = false;
  if (address.startsWith('0x')) {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    });
    valid = await publicClient.verifyMessage({
      address: address,
      message: siweMessage.toMessage(), // Validation must be done on the message as string
      signature,
    });
  } else if (address.startsWith('5')) {
    valid = signatureVerify(siweMessage.toMessage(), signature, address);
  } else {
    throw new ValidationError(`verifySiweMessage: Invalid address format: ${address}`);
  }

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
const verifyInitialMessageFields = (siweMessage) => {
  // Fields we validate on initial
  const scheme = siweMessage.scheme; // must be https
  const expirationTime = siweMessage.expirationTime;

  if (scheme !== 'https') {
    throw new ValidationError('Scheme must be https');
  }

  if (!expirationTime || isNaN(new Date(expirationTime).getTime())) {
    throw new ValidationError('Must define a valid expiration time');
  }

  // Check if expiration is within a reasonable range from current time
  const currentTime = new Date().getTime();
  const expirationTimestamp = new Date(expirationTime).getTime();

  const expirationGracePeriod = 1000 * 60 * 10; // 10 minutes
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

const verifyAndStoreSiweMessage = async (nonce, signature, siweMessage) => {
  const validatedMessage = await verifySiweMessage(nonce, signature, siweMessage);

  // Perform additional checks to ensure message fields are valid
  verifyInitialMessageFields(validatedMessage);

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
  return siweData.address;
};

const validateSignatureAndGetMemo = async (nonce, userChallengeSignature) => {
  if (!userChallengeSignature || !nonce) {
    return null; // Default memo value when single stellar account is used
  }

  let message;
  try {
    // initialSiweMessage must be undefined after an initial check,
    // message must exist on the map.
    message = await verifySiweMessage(nonce, userChallengeSignature, undefined);
  } catch (e) {
    throw new Error(`Could not verify signature: ${e.message}`);
  }

  const memo = await deriveMemoFromAddress(message.address);
  return memo;
};

module.exports = { verifySiweMessage, verifyAndStoreSiweMessage, createAndSendNonce, validateSignatureAndGetMemo };
