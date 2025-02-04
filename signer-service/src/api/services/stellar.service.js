const { Horizon, Keypair, TransactionBuilder, Operation, Networks, Asset, Memo, Account } = require('stellar-sdk');
const {
  HORIZON_URL,
  FUNDING_SECRET,
  STELLAR_FUNDING_AMOUNT_UNITS,
  STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS,
} = require('../../constants/constants');
const { TOKEN_CONFIG, getTokenConfigByAssetCode } = require('../../constants/tokenConfig');
const { SlackNotifier } = require('./slack.service');

// Derive funding pk
const FUNDING_PUBLIC_KEY = Keypair.fromSecret(FUNDING_SECRET).publicKey();
const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

async function buildCreationStellarTx(fundingSecret, ephemeralAccountId, maxTime, assetCode, baseFee) {
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
    fee: baseFee,
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
  baseFee,
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
    fee: baseFee,
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
    fee: baseFee,
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
  const slackNotifier = new SlackNotifier();
  let stellarBalance = null;

  try {
    // ensure the funding account exists
    const account = await horizonServer.loadAccount(FUNDING_PUBLIC_KEY);
    stellarBalance = account.balances.find((balance) => balance.asset_type === 'native');

    // ensure we have at the very least 10 XLM in the account
    if (Number(stellarBalance.balance) < STELLAR_FUNDING_AMOUNT_UNITS) {
      slackNotifier.sendMessage({
        text: `Current balance of funding account is ${stellarBalance.balance} XLM please charge the account ${FUNDING_PUBLIC_KEY}.`,
      });
      return { status: false, public: FUNDING_PUBLIC_KEY };
    }

    return { status: true, public: FUNDING_PUBLIC_KEY };
  } catch (error) {
    console.error("Couldn't load Stellar account: ", error);
    return { status: false, public: FUNDING_PUBLIC_KEY };
  }
}

module.exports = { buildCreationStellarTx, buildPaymentAndMergeTx, sendStatusWithPk };
