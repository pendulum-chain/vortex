import { Horizon, Keypair, TransactionBuilder, Operation, Networks, Asset, Memo, Account } from 'stellar-sdk';
import { HORIZON_URL, FUNDING_SECRET, STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../constants/constants';
import { StellarTokenConfig, TOKEN_CONFIG, getTokenConfigByAssetCode } from '../../constants/tokenConfig';

export interface PaymentData {
  amount: string;
  memo: string;
  memoType: 'text' | 'hash';
  offrampingAccount: string;
}

interface CreationTxResult {
  signature: string[];
  sequence: string;
}

interface PaymentTxResult {
  signature: string[];
}

// Constants
const FUNDING_PUBLIC_KEY = Keypair.fromSecret(FUNDING_SECRET || '').publicKey();
export const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

async function buildCreationStellarTx(
  fundingSecret: string,
  ephemeralAccountId: string,
  maxTime: number,
  assetCode: string,
  baseFee: string,
): Promise<CreationTxResult> {
  const tokenConfig = getTokenConfigByAssetCode(TOKEN_CONFIG, assetCode) as StellarTokenConfig;
  if (!tokenConfig) {
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
  fundingSecret: string,
  ephemeralAccountId: string,
  ephemeralSequence: string,
  paymentData: PaymentData,
  maxTime: number,
  assetCode: string,
  baseFee: string,
): Promise<PaymentTxResult> {
  const ephemeralAccount = new Account(ephemeralAccountId, ephemeralSequence);
  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const { amount, memo, memoType, offrampingAccount } = paymentData;

  const tokenConfig = getTokenConfigByAssetCode(TOKEN_CONFIG, assetCode) as StellarTokenConfig;
  if (!tokenConfig) {
    throw new Error('Invalid asset id or configuration not found');
  }

  const transactionMemo = memoType === 'text' ? Memo.text(memo) : Memo.hash(Buffer.from(memo, 'base64'));

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

export { buildCreationStellarTx, buildPaymentAndMergeTx };
