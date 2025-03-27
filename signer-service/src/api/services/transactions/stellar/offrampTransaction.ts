import { Horizon, Keypair, TransactionBuilder, Operation, Networks, Asset, Memo, Account } from 'stellar-sdk';
import {
  HORIZON_URL,
  FUNDING_SECRET,
  STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS,
  STELLAR_BASE_FEE,
} from '../../../../constants/constants';
import { StellarTokenConfig, TOKEN_CONFIG, getTokenConfigByAssetCode } from '../../../../constants/tokenConfig';
import { loadAccountWithRetry } from '../../stellar/loadAccount';
import { StellarTokenDetails } from '../../../../../../src/constants/tokenConfig';

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : '';
const NETWORK_PASSPHRASE = Networks.PUBLIC;
const MAX_TIME = Date.now() + 1000 * 60 * 10;
export interface PaymentData {
  amount: string;
  memo: string;
  memoType: 'text' | 'hash';
  offrampingAccount: string;
}

export async function buildPaymentAndMergeTx(
  ephemeralAccountId: string,
  paymentData: PaymentData,
  tokenConfigStellar: StellarTokenDetails,
): Promise<{ paymentTransaction: string; mergeAccountTransaction: string; startingSequenceNumber: string }> {
  if (!FUNDING_SECRET) {
    throw new Error('Stellar funding secret not defined');
  }
  const ephemeralAccount = await loadAccountWithRetry(ephemeralAccountId);
  if (!ephemeralAccount) {
    throw new Error(`Ephemeral account ${ephemeralAccountId} must be created at this stage`);
  }
  const startingSequenceNumber = ephemeralAccount.sequenceNumber();

  const fundingAccountKeypair = Keypair.fromSecret(FUNDING_SECRET);

  const { amount, memo, memoType, offrampingAccount } = paymentData;

  const transactionMemo = memoType === 'text' ? Memo.text(memo) : Memo.hash(Buffer.from(memo, 'base64'));

  const paymentTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: STELLAR_BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        amount,
        asset: new Asset(
          tokenConfigStellar.stellarAsset.code.string,
          tokenConfigStellar.stellarAsset.issuer.stellarEncoding,
        ),
        destination: offrampingAccount,
      }),
    )
    .addMemo(transactionMemo)
    .setTimebounds(0, MAX_TIME)
    .build();

  const mergeAccountTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: STELLAR_BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(
          tokenConfigStellar.stellarAsset.code.string,
          tokenConfigStellar.stellarAsset.issuer.stellarEncoding,
        ),
        limit: '0',
      }),
    )
    .addOperation(
      Operation.accountMerge({
        destination: FUNDING_PUBLIC_KEY,
      }),
    )
    .setTimebounds(0, MAX_TIME)
    .build();

  paymentTransaction.sign(fundingAccountKeypair);
  mergeAccountTransaction.sign(fundingAccountKeypair);

  return {
    paymentTransaction: paymentTransaction.toXDR(),
    mergeAccountTransaction: mergeAccountTransaction.toXDR(),
    startingSequenceNumber,
  };
}
