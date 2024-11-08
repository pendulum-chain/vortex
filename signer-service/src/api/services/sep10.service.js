const { Keypair } = require('stellar-sdk');
const { TransactionBuilder, Networks } = require('stellar-sdk');
const { fetchTomlValues } = require('../helpers/anchors');

const { TOKEN_CONFIG } = require('../../constants/tokenConfig');
const { CLIENT_SECRET } = require('../../constants/constants');

const NETWORK_PASSPHRASE = Networks.PUBLIC;

exports.signSep10Challenge = async (challengeXDR, outToken, clientPublicKey) => {
  const clientDomainStellarKeypair = Keypair.fromSecret(CLIENT_SECRET);

  const { signingKey: anchorSigningKey } = await fetchTomlValues(TOKEN_CONFIG[outToken].tomlFileUrl);
  const { homeDomain, clientDomainEnabled } = TOKEN_CONFIG[outToken];

  const transactionSigned = new TransactionBuilder.fromXDR(challengeXDR, NETWORK_PASSPHRASE);
  if (transactionSigned.source !== anchorSigningKey) {
    throw new Error(`Invalid source account: ${transactionSigned.source}`);
  }
  if (transactionSigned.sequence !== '0') {
    throw new Error(`Invalid sequence number: ${transactionSigned.sequence}`);
  }

  // See https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md#success
  // memo field should be empty as we assume (in this implementation) that we use the ephemeral
  // to authenticate. But no memo sub account derivation.
  if (transactionSigned.memo.value !== null) {
    throw new Error('Memo does not match');
  }

  const { operations } = transactionSigned;
  // Verify the first manage_data operation
  const firstOp = operations[0];
  if (firstOp.type !== 'manageData') {
    throw new Error('The first operation should be manageData');
  }

  // Only authorize a session that corresponds with the ephemeral client account
  if (firstOp.source !== clientPublicKey) {
    throw new Error('First manageData operation must have the client account as the source');
  }

  if (firstOp.name !== `${homeDomain} auth`) {
    throw new Error(`First manageData operation should have key '${homeDomain} auth'`);
  }
  if (!firstOp.value || firstOp.value.length !== 64) {
    throw new Error('First manageData operation should have a 64-byte random nonce as value');
  }

  // Flags to check presence of required operations
  let hasWebAuthDomain = false;
  let hasClientDomain = false;

  // Verify extra manage_data operations, web_auth and proper client domain.
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

  return {
    clientSignature: clientDomainSignature,
    clientPublic: clientDomainStellarKeypair.publicKey(),
  };
};
