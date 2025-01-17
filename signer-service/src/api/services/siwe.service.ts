import { generateNonce } from 'siwe';
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { signatureVerify } from '@polkadot/util-crypto';
import { SignInMessage } from '../helpers/siweMessageFormatter';
import { deriveMemoFromAddress } from '../helpers/memoDerivation';
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } from '../../constants/constants';

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiweValidationError';
  }
}

interface SiweData {
  siweMessage: SignInMessage | undefined;
  address: string;
}

// Map that will hold the siwe messages sent + nonce we defined
const siweMessagesMap = new Map<string, SiweData>();

const createAndSendNonce = async (address: string): Promise<{ nonce: string }> => {
  const nonce = generateNonce();
  const siweMessage = undefined; // Initial message is undefined since it will be created in UI.
  siweMessagesMap.set(nonce, { siweMessage, address });
  return { nonce };
};

// Used to verify the integrity and validity of the signature
// For the initial verification, the siweMessage must be provided as parameter
const verifySiweMessage = async (
  nonce: string,
  signature: string,
  initialSiweMessage?: string,
): Promise<SignInMessage> => {
  const existingSiweDataForNonce = siweMessagesMap.get(nonce);
  if (!existingSiweDataForNonce) {
    throw new ValidationError('Message not found, we have not sent this nonce or nonce is incorrect');
  }

  const siweMessage = existingSiweDataForNonce.siweMessage
    ? existingSiweDataForNonce.siweMessage
    : initialSiweMessage
    ? SignInMessage.fromMessage(initialSiweMessage)
    : undefined;

  const { address } = existingSiweDataForNonce;

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
      address: address as `0x${string}`,
      message: siweMessage.toMessage(), // Validation must be done on the message as string
      signature: signature as `0x${string}`,
    });
  } else if (address.startsWith('5')) {
    valid = signatureVerify(siweMessage.toMessage(), signature, address).isValid;
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
const verifyInitialMessageFields = (siweMessage: SignInMessage): void => {
  const { scheme, expirationTime } = siweMessage;

  if (scheme !== 'https') {
    throw new ValidationError('Scheme must be https');
  }

  if (!expirationTime || isNaN(new Date(expirationTime).getTime())) {
    throw new ValidationError('Must define a valid expiration time');
  }

  // Check if expiration is within a reasonable range from current time
  const currentTime = Date.now();
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

const verifyAndStoreSiweMessage = async (nonce: string, signature: string, siweMessage: string): Promise<string> => {
  const validatedMessage = await verifySiweMessage(nonce, signature, siweMessage);

  // Perform additional checks to ensure message fields are valid
  verifyInitialMessageFields(validatedMessage);

  // Verification complete. Update the map and append the message.
  const siweData = siweMessagesMap.get(nonce);
  if (!siweData) throw new ValidationError('Message data not found');

  // Update the map with validated message
  siweData.siweMessage = validatedMessage;
  siweMessagesMap.set(nonce, siweData);

  // Keep one valid session per address
  for (const [key, data] of siweMessagesMap.entries()) {
    if (data.address === siweData.address && key !== validatedMessage.nonce) {
      siweMessagesMap.delete(key);
    }
  }

  return siweData.address;
};

const validateSignatureAndGetMemo = async (
  nonce: string | null,
  userChallengeSignature: string | null,
): Promise<string | null> => {
  if (!userChallengeSignature || !nonce) {
    return null; // Default memo value when single stellar account is used
  }

  try {
    const message = await verifySiweMessage(nonce, userChallengeSignature);
    return deriveMemoFromAddress(message.address);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Could not verify signature: ${error.message}`);
    }
    throw error;
  }
};

export { verifySiweMessage, verifyAndStoreSiweMessage, createAndSendNonce, validateSignatureAndGetMemo };
