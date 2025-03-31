import {Asset, Keypair, Memo, Networks, Operation, TransactionBuilder} from 'stellar-sdk';
import {FUNDING_SECRET, STELLAR_BASE_FEE,} from '../../../../constants/constants';
import {StellarTokenDetails, PaymentData} from 'shared';
import {loadAccountWithRetry} from '../../stellar/loadAccount';

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : '';
const NETWORK_PASSPHRASE = Networks.PUBLIC;
const MAX_TIME = Date.now() + 1000 * 60 * 10;



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

  const {amount, memo, memoType, offrampingAccount} = paymentData;

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
