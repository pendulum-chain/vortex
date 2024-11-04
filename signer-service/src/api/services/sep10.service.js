const { Keypair } = require('stellar-sdk');
const { TransactionBuilder, Networks } = require('stellar-sdk');
const { fetchTomlValues } = require('../helpers/anchors');

const { TOKEN_CONFIG } = require('../../constants/tokenConfig');
const { FUNDING_SECRET } = require('../../constants/constants');

const NETWORK_PASSPHRASE = Networks.PUBLIC;

exports.signSep10Challenge = async (challengeXDR) => {
  const masterStellarKeypair = Keypair.fromSecret(FUNDING_SECRET);
  const { signingKey: anchorSigningKey } = await fetchTomlValues(TOKEN_CONFIG.ars.tomlFileUrl);

  const transactionSigned = new TransactionBuilder.fromXDR(challengeXDR, NETWORK_PASSPHRASE);
  if (transactionSigned.source !== anchorSigningKey) {
    throw new Error(`Invalid source account: ${transactionSigned.source}`);
  }
  if (transactionSigned.sequence !== '0') {
    throw new Error(`Invalid sequence number: ${transactionSigned.sequence}`);
  }

  // Verify manage_data operations
  const operations = transactionSigned.operations;
  // Verify the first manage_data operation
  const firstOp = operations[0];
  if (firstOp.type !== 'manageData') {
    throw new Error('The first operation should be manageData');
  }
  // We only want to accept a challenge that would authorize the master key.
  if (firstOp.source !== masterStellarKeypair.publicKey()) {
    throw new Error('First manageData operation must have the master signing key as the source');
  }

  // Purposely hardcode Anclap's key, we don't want to sign this type of transaction
  // for Mykobo
  const expectedKey = `api.anclap.com auth`;
  if (firstOp.name !== expectedKey) {
    throw new Error(`First manageData operation should have key '${expectedKey}'`);
  }
  if (!firstOp.value || firstOp.value.length !== 64) {
    throw new Error('First manageData operation should have a 64-byte random nonce as value');
  }

  // Flags to check presence of required operations
  let hasWebAuthDomain = false;

  // Verify extra manage_data operations
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

      // value web_auth_domain but in bytes
      // if (op.value !== 'web_auth_domain') {
      //   throw new Error(`web_auth_domain manageData operation should have value 'web_auth_domain'`);
      // }
    }
  }

  //  the web_auth_domain and client_domain operation must be present
  if (!hasWebAuthDomain) {
    throw new Error('Transaction must contain a web_auth_domain manageData operation');
  }

  const signature = transactionSigned.getKeypairSignature(masterStellarKeypair);
  return { masterSignature: signature, masterPublic: masterStellarKeypair.publicKey() };
};
