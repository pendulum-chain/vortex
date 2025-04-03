import { Account, Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from 'stellar-sdk';
import { FUNDING_SECRET, STELLAR_BASE_FEE } from '../../../../constants/constants';
import { StellarTokenDetails, PaymentData, HORIZON_URL, STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS } from 'shared';
import { loadAccountWithRetry } from '../../stellar/loadAccount';

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : '';
const NETWORK_PASSPHRASE = Networks.PUBLIC;
const MAX_TIME = Date.now() + 1000 * 60 * 10;

export const horizonServer = new Horizon.Server(HORIZON_URL);
export const ARBITRARY_STARTING_SEQUENCE_NUMBER = 1596191618056193;
export async function buildPaymentAndMergeTx(
  ephemeralAccountId: string,
  paymentData: PaymentData,
  tokenConfigStellar: StellarTokenDetails,
): Promise<{
  paymentTransaction: string;
  mergeAccountTransaction: string;
  fundingAccountSequence: string;
  createAccountTransaction: string;
}> {
  const baseFee = STELLAR_BASE_FEE;
  const maxTime = Date.now() + 1000 * 60 * 10;

  if (!FUNDING_SECRET) {
    console.log('Secret not defined');
    throw new Error('Stellar funding secret not defined');
  }
  // const ephemeralAccount = await loadAccountWithRetry(ephemeralAccountId);
  // if (!ephemeralAccount) {
  //   console.log('Ephemeral account not found');
  //   throw new Error(`Ephemeral account ${ephemeralAccountId} must be created at this stage`);
  // }
  //const startingSequenceNumber = ephemeralAccount.sequenceNumber();
  const ephemeralAccount = new Account(ephemeralAccountId, '0');

  const fundingAccountKeypair = Keypair.fromSecret(FUNDING_SECRET);

  const { amount, memo, memoType, anchorTargetAccount } = paymentData;

  const transactionMemo = memoType === 'text' ? Memo.text(memo) : Memo.hash(Buffer.from(memo, 'base64'));

  const fundingAccount = await horizonServer.loadAccount(fundingAccountKeypair.publicKey());
  const fundingAccountSequence = fundingAccount.sequenceNumber();

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
        signer: { ed25519PublicKey: fundingAccountKeypair.publicKey(), weight: 1 },
        lowThreshold: 2,
        medThreshold: 2,
        highThreshold: 2,
      }),
    )
    .addOperation(
      Operation.changeTrust({
        source: ephemeralAccountId,
        asset: new Asset(
          tokenConfigStellar.stellarAsset.code.string,
          tokenConfigStellar.stellarAsset.issuer.stellarEncoding,
        ),
      }),
    )
    .setTimebounds(0, maxTime)
    .build();

  createAccountTransaction.sign(fundingAccountKeypair);

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
        destination: anchorTargetAccount,
      }),
    )
    .addMemo(transactionMemo)
    .setTimebounds(0, MAX_TIME)
    .setMinAccountSequence(String(ARBITRARY_STARTING_SEQUENCE_NUMBER))
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
    .setMinAccountSequence(String(ARBITRARY_STARTING_SEQUENCE_NUMBER + 1))
    .build();

  paymentTransaction.sign(fundingAccountKeypair);
  mergeAccountTransaction.sign(fundingAccountKeypair);

  return {
    createAccountTransaction: createAccountTransaction.toEnvelope().toXDR().toString('base64'),
    paymentTransaction: paymentTransaction.toEnvelope().toXDR().toString('base64'),
    mergeAccountTransaction: mergeAccountTransaction.toEnvelope().toXDR().toString('base64'),
    fundingAccountSequence,
  };
}
