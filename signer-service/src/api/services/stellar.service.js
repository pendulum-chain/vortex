const {
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  Asset,
  Memo,
  Transaction,
  Account,
} = require('stellar-sdk');
const { HORIZON_URL, BASE_FEE } = require('../../constants/constants');
const { TOKEN_CONFIG } = require('../../constants/tokenConfig');

const FUNDING_SECRET = process.env.FUNDING_SECRET;
// Derive funding pk
const FUNDING_PUBLIC_KEY = Keypair.fromSecret(FUNDING_SECRET).publicKey();
const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

async function buildCreationStellarTx(fundingSecret, ephemeralAccountId, maxTime, assetId) {

  const tokenConfig = TOKEN_CONFIG[assetId];
  if (tokenConfig === undefined) {
    console.error("ERROR: Invalid asset id or configuration not found");
    throw new Error("Invalid asset id or configuration not found");
  }

  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const fundingAccountId = fundingAccountKeypair.publicKey();
  const fundingAccount = await horizonServer.loadAccount(fundingAccountId);
  const fundingSequence = fundingAccount.sequence;
  // add a setOption oeration in order to make this a 2-of-2 multisig account where the
  // funding account is a cosigner
  let createAccountTransaction = new TransactionBuilder(fundingAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createAccount({
        destination: ephemeralAccountId,
        startingBalance: '2.5',
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

async function buildPaymentAndMergeTx(fundingSecret, ephemeralAccountId, ephemeralSequence, paymentData, maxTime, assetId) {
  const ephemeralAccount = new Account(ephemeralAccountId, ephemeralSequence);
  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const { amount, memo, memoType, offrampingAccount } = paymentData;

  const tokenConfig = TOKEN_CONFIG[assetId];
  if (tokenConfig === undefined) {
    throw new Error("Invalid asset id or configuration not found");
  }

  let transactionMemo;
  switch (memoType) {
    case "text":
      transactionMemo = Memo.text(memo);
      break;

    case "hash":
      transactionMemo = Memo.hash(Buffer.from(memo, "base64"));
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

module.exports = { buildCreationStellarTx, buildPaymentAndMergeTx };
