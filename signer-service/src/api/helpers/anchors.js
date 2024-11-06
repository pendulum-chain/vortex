const fetchTomlValues = async (tomlFileUrl) => {
  const response = await fetch(tomlFileUrl);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch TOML file: ${response.statusText}`);
  }

  const tomlFileContent = (await response.text()).split('\n');
  const findValueInToml = (key) => {
    const keyValue = tomlFileContent.find((line) => line.includes(key));
    return keyValue?.split('=')[1].trim().replaceAll('"', '');
  };

  return {
    signingKey: findValueInToml('SIGNING_KEY'),
    webAuthEndpoint: findValueInToml('WEB_AUTH_ENDPOINT'),
    sep24Url: findValueInToml('TRANSFER_SERVER_SEP0024'),
    sep6Url: findValueInToml('TRANSFER_SERVER'),
    kycServer: findValueInToml('KYC_SERVER'),
  };
};

const verifyClientDomainChallengeOps = async (
  challengeXDR,
  networkPassphrase,
  signingKey,
  clientPublicKey,
  memo,
  expectedKey,
) => {
  const transactionSigned = new TransactionBuilder.fromXDR(challengeXDR, networkPassphrase);
  if (transactionSigned.source !== signingKey) {
    throw new Error(`Invalid source account: ${transactionSigned.source}`);
  }
  if (transactionSigned.sequence !== '0') {
    throw new Error(`Invalid sequence number: ${transactionSigned.sequence}`);
  }

  // See https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md#success
  // memo field should match and not be empty.
  if (transactionSigned.memo.value !== memo) {
    throw new Error('Memo does not match');
  }

  // Verify manage_data operations
  const operations = transactionSigned.operations;
  // Verify the first manage_data operation
  const firstOp = operations[0];
  if (firstOp.type !== 'manageData') {
    throw new Error('The first operation should be manageData');
  }
  // We don't want to accept a challenge that would authorize as Application client account!
  // We DO accept a challenge where the source is the master account + memo
  if (firstOp.source !== clientPublicKey || firstOp.source == signingKey) {
    throw new Error('First manageData operation must have the client account as the source');
  }

  if (firstOp.name !== expectedKey) {
    throw new Error(`First manageData operation should have key '${expectedKey}'`);
  }
  if (!firstOp.value || firstOp.value.length !== 64) {
    throw new Error('First manageData operation should have a 64-byte random nonce as value');
  }

  let hasWebAuthDomain = false;
  let hasClientDomain = false;

  // Verify extra manage_data operations
  for (let i = 1; i < operations.length; i++) {
    const op = operations[i];

    if (op.type !== 'manageData') {
      throw new Error('All operations should be manage_data operations');
    }

    // Verify web_auth_domain operation
    if (op.name === 'web_auth_domain') {
      hasWebAuthDomain = true;
      if (op.source !== signingKey) {
        throw new Error('web_auth_domain manage_data operation must have the server account as the source');
      }
    }

    // Verify client_domain operation (if applicable)
    if (op.name === 'client_domain') {
      hasClientDomain = true;
      // Replace 'CLIENT_DOMAIN_ACCOUNT' with the actual client domain account public key
      if (op.source !== keypair.publicKey()) {
        throw new Error('client_domain manage_data operation must have the client domain account as the source');
      }
    }
  }

  //  the web_auth_domain and client_domain operation must be present
  if (!hasWebAuthDomain) {
    throw new Error('Transaction must contain a web_auth_domain manageData operation');
  }
  if (!hasClientDomain) {
    throw new Error('Transaction must contain a client_domain manageData operation');
  }
};

module.exports = { fetchTomlValues, verifyClientDomainChallengeOps };
