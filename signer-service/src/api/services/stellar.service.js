const { Horizon, Keypair, TransactionBuilder, Operation, Networks, Asset, Memo, Account } = require('stellar-sdk');
const {
  HORIZON_URL,
  BASE_FEE,
  FUNDING_SECRET,
  STELLAR_FUNDING_AMOUNT_UNITS,
  STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS,
  CLIENT_SECRET,
} = require('../../constants/constants');
const { TOKEN_CONFIG, getTokenConfigByAssetCode } = require('../../constants/tokenConfig');
const { fetchTomlValues } = require('../helpers/anchors');
// Derive funding pk
const FUNDING_PUBLIC_KEY = Keypair.fromSecret(FUNDING_SECRET).publicKey();
const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

async function buildCreationStellarTx(fundingSecret, ephemeralAccountId, maxTime, assetCode) {
  const tokenConfig = getTokenConfigByAssetCode(TOKEN_CONFIG, assetCode);
  if (tokenConfig === undefined) {
    console.error('ERROR: Invalid asset id or configuration not found');
    throw new Error('Invalid asset id or configuration not found');
  }

  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const fundingAccountId = fundingAccountKeypair.publicKey();
  const fundingAccount = await horizonServer.loadAccount(fundingAccountId);
  const fundingSequence = fundingAccount.sequence;
  // add a setOption oeration in order to make this a 2-of-2 multisig account where the
  // funding account is a cosigner
  const createAccountTransaction = new TransactionBuilder(fundingAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createAccount({
        destination: ephemeralAccountId,
        startingBalance: STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS,
      }),
    )
    .addOperation(
      Operation.setOptions({
        source: ephemeralAccountId,
        signer: { ed25519PublicKey: fundingAccountId, weight: 1 },
        lowThreshold: 2,
        medThreshold: 2,
        highThreshold: 2,
      }),
    )
    .addOperation(
      Operation.changeTrust({
        source: ephemeralAccountId,
        asset: new Asset(tokenConfig.assetCode, tokenConfig.assetIssuer),
      }),
    )
    .setTimebounds(0, maxTime)
    .build();

  return {
    signature: [createAccountTransaction.getKeypairSignature(fundingAccountKeypair)],
    sequence: fundingSequence,
  };
}

async function buildPaymentAndMergeTx(
  fundingSecret,
  ephemeralAccountId,
  ephemeralSequence,
  paymentData,
  maxTime,
  assetCode,
) {
  const ephemeralAccount = new Account(ephemeralAccountId, ephemeralSequence);
  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const { amount, memo, memoType, offrampingAccount } = paymentData;

  const tokenConfig = getTokenConfigByAssetCode(TOKEN_CONFIG, assetCode);
  if (tokenConfig === undefined) {
    throw new Error('Invalid asset id or configuration not found');
  }

  let transactionMemo;
  switch (memoType) {
    case 'text':
      transactionMemo = Memo.text(memo);
      break;

    case 'hash':
      transactionMemo = Memo.hash(Buffer.from(memo, 'base64'));
      break;

    default:
      throw new Error(`Unexpected offramp memo type: ${memoType}`);
  }

  const paymentTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        amount,
        asset: new Asset(tokenConfig.assetCode, tokenConfig.assetIssuer),
        destination: offrampingAccount,
      }),
    )
    .addMemo(transactionMemo)
    .setTimebounds(0, maxTime)
    .build();

  const mergeAccountTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(tokenConfig.assetCode, tokenConfig.assetIssuer),
        limit: '0',
      }),
    )
    .addOperation(
      Operation.accountMerge({
        destination: FUNDING_PUBLIC_KEY,
      }),
    )
    .setTimebounds(0, maxTime)
    .build();

  return {
    signature: [
      paymentTransaction.getKeypairSignature(fundingAccountKeypair),
      mergeAccountTransaction.getKeypairSignature(fundingAccountKeypair),
    ],
  };
}

async function sendStatusWithPk() {
  try {
    // ensure the funding account exists
    const horizonServer = new Horizon.Server(HORIZON_URL);
    let account = await horizonServer.loadAccount(FUNDING_PUBLIC_KEY);
    let stellarBalance = account.balances.find((balance) => balance.asset_type === 'native');

    // ensure we have at the very least 10 XLM in the account
    if (Number(stellarBalance.balance) < STELLAR_FUNDING_AMOUNT_UNITS) {
      return { status: false, public: FUNDING_PUBLIC_KEY };
    }

    return { status: true, public: FUNDING_PUBLIC_KEY };
  } catch (error) {
    console.error("Couldn't load Stellar account: ", error);
    return { status: false, public: FUNDING_PUBLIC_KEY };
  }
}

async function signSep10Challenge(challengeXDR, outToken, clientPublicKey) {
  const keypair = Keypair.fromSecret(CLIENT_SECRET);

  const { signingKey } = await fetchTomlValues(TOKEN_CONFIG[outToken].tomlFileUrl);

  const transactionSigned = new TransactionBuilder.fromXDR(challengeXDR, NETWORK_PASSPHRASE);
  if (transactionSigned.source !== signingKey) {
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
  // We don't want to accept a challenge that would authorize as Application client account!
  if (firstOp.source !== clientPublicKey || firstOp.source == signingKey) {
    throw new Error('First manageData operation must have the client account as the source');
  }

  // TODO how to make the expected key based on outToken? with a simple manual map?
  const expectedKey = `mykobo.co auth`;
  if (firstOp.name !== expectedKey) {
    throw new Error(`First manageData operation should have key '${expectedKey}'`);
  }
  if (!firstOp.value || firstOp.value.length !== 64) {
    throw new Error('First manageData operation should have a 64-byte random nonce as value');
  }

  // Flags to check presence of required operations
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

      // value web_auth_domain but in bytes
      // if (op.value !== 'web_auth_domain') {
      //   throw new Error(`web_auth_domain manageData operation should have value 'web_auth_domain'`);
      // }
    }

    // Verify client_domain operation (if applicable)
    if (op.name === 'client_domain') {
      hasClientDomain = true;
      // Replace 'CLIENT_DOMAIN_ACCOUNT' with the actual client domain account public key
      if (op.source !== keypair.publicKey()) {
        throw new Error('client_domain manage_data operation must have the client domain account as the source');
      }
      // Also in bytes first
      // if (op.value !== 'client_domain') {
      //   throw new Error(`client_domain manageData operation should have value 'client_domain'`);
      // }
    }
  }

  //  the web_auth_domain and client_domain operation must be present
  if (!hasWebAuthDomain) {
    throw new Error('Transaction must contain a web_auth_domain manageData operation');
  }
  if (!hasClientDomain) {
    throw new Error('Transaction must contain a client_domain manageData operation');
  }

  const signature = transactionSigned.getKeypairSignature(keypair);
  return { clientSignature: signature, clientPublic: keypair.publicKey() };
}

module.exports = { buildCreationStellarTx, buildPaymentAndMergeTx, sendStatusWithPk, signSep10Challenge };
