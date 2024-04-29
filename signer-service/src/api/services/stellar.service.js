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
const { HORIZON_URL, BASE_FEE, ASSET_CODE, ASSET_ISSUER } = require('../../constants/constants');

const FUNDING_SECRET = process.env.FUNDING_SECRET;
// Derive funding pk
const FUNDING_PUBLIC_KEY= Keypair.fromSecret(FUNDING_SECRET).publicKey();
const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

async function buildCreationStellarTx(fundingSecret, ephemeralAccountId, maxTime) {
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
        asset: new Asset(ASSET_CODE, ASSET_ISSUER),
      }),
    )
    .setTimebounds(0, maxTime)
    .build();

  return {
    signature: [createAccountTransaction.getKeypairSignature(fundingAccountKeypair)],
    sequence: fundingSequence,
  };
}

async function buildPaymentAndMergeTx(fundingSecret, ephemeralAccountId, ephemeralSequence, paymentData, maxTime) {
  const ephemeralAccount = new Account(ephemeralAccountId, ephemeralSequence);
  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const { amount, memo, offrampingAccount } = paymentData;

  const paymentTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        amount,
        asset: new Asset(ASSET_CODE, ASSET_ISSUER),
        destination: offrampingAccount,
      }),
    )
    .addMemo(Memo.text(memo))
    .setTimebounds(0, maxTime)
    .build();

  const mergeAccountTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(ASSET_CODE, ASSET_ISSUER),
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
