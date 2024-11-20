const { Keypair } = require('stellar-sdk');
const { TransactionBuilder, Networks } = require('stellar-sdk');
const { fetchTomlValues } = require('../helpers/anchors');
const { verifySiweMessage } = require('./siwe.service');
const { keccak256 } = require('viem/utils');

const { TOKEN_CONFIG } = require('../../constants/tokenConfig');
const { SEP10_MASTER_SECRET, CLIENT_DOMAIN_SECRET } = require('../../constants/constants');

const NETWORK_PASSPHRASE = Networks.PUBLIC;

async function deriveMemoFromAddress(address) {
  const hash = keccak256(address);
  return BigInt(hash).toString().slice(0, 15);
}

// we validate a challenge for a given nonce. From it we obtain the address and derive the memo
// we can then ensure that the memo is the same as the one we expect from the anchor challenge
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

exports.signSep10Challenge = async (challengeXDR, outToken, clientPublicKey, userChallengeSignature, nonce) => {
  const masterStellarKeypair = Keypair.fromSecret(SEP10_MASTER_SECRET);
  const clientDomainStellarKeypair = Keypair.fromSecret(CLIENT_DOMAIN_SECRET);

  const { signingKey: anchorSigningKey } = await fetchTomlValues(TOKEN_CONFIG[outToken].tomlFileUrl);
  const { homeDomain, clientDomainEnabled, memoEnabled } = TOKEN_CONFIG[outToken];

  // Expected memo based on user's signature and nonce.
  const memo = await validateSignatureAndGetMemo(nonce, userChallengeSignature);

  const transactionSigned = new TransactionBuilder.fromXDR(challengeXDR, NETWORK_PASSPHRASE);
  if (transactionSigned.source !== anchorSigningKey) {
    throw new Error(`Invalid source account: ${transactionSigned.source}`);
  }
  if (transactionSigned.sequence !== '0') {
    throw new Error(`Invalid sequence number: ${transactionSigned.sequence}`);
  }

  // See https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md#success
  // memo field should be empty for the ephemeral case, or the corresponding one based on evm address
  // derivation.
  if (transactionSigned.memo.value !== memo) {
    throw new Error('Memo does not match with specified user signature or address. Could not validate.');
  }

  const { operations } = transactionSigned;
  // Verify the first manage_data operation
  const firstOp = operations[0];
  if (firstOp.type !== 'manageData') {
    throw new Error('The first operation should be manageData');
  }

  // clientPublicKey is either: the ephemeral, or the master account
  if (firstOp.source !== clientPublicKey) {
    throw new Error('First manageData operation must have the client account as the source');
  }

  if (memo !== null && memoEnabled) {
    if (firstOp.source !== masterStellarKeypair.publicKey()) {
      throw new Error(
        'First manageData operation must have the master signing key as the source when memo is being used.',
      );
    }
  }

  if (firstOp.name !== `${homeDomain} auth`) {
    throw new Error(`First manageData operation should have key '${homeDomain} auth'`);
  }
  if (!firstOp.value || firstOp.value.length !== 64) {
    throw new Error('First manageData operation should have a 64-byte random nonce as value');
  }

  let hasWebAuthDomain = false;
  let hasClientDomain = false;

  for (let i = 1; i < operations.length; i++) {
    const op = operations[i];

    if (op.type !== 'manageData') {
      throw new Error('All operations should be manage_data operations');
    }

    // Verify web_auth_domain operation
    if (op.name === 'web_auth_domain') {
      hasWebAuthDomain = true;
      if (op.source !== anchorSigningKey) {
        throw new Error('web_auth_domain manage_data operation must have the server account as the source');
      }
    }

    if (op.name === 'client_domain') {
      hasClientDomain = true;
      if (op.source !== clientDomainStellarKeypair.publicKey()) {
        throw new Error('client_domain manage_data operation must have the client domain account as the source');
      }
    }
  }

  //  the web_auth_domain and client_domain operation must be present
  if (!hasWebAuthDomain) {
    throw new Error('Transaction must contain a web_auth_domain manageData operation');
  }
  if (!hasClientDomain && clientDomainEnabled) {
    throw new Error('Transaction must contain a client_domain manageData operation');
  }

  let clientDomainSignature;
  if (clientDomainEnabled) {
    clientDomainSignature = transactionSigned.getKeypairSignature(clientDomainStellarKeypair);
  }

  let masterClientSignature;
  if (memo !== null && memoEnabled) {
    masterClientSignature = transactionSigned.getKeypairSignature(masterStellarKeypair);
  }

  return {
    clientSignature: clientDomainSignature,
    clientPublic: clientDomainStellarKeypair.publicKey(),
    masterClientSignature,
    masterClientPublic: masterStellarKeypair.publicKey(),
  };
};
