import { Account, Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from 'stellar-sdk';
import { FUNDING_SECRET, STELLAR_BASE_FEE } from '../../../../constants/constants';
import { StellarTokenDetails, PaymentData, HORIZON_URL, STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS } from 'shared';
import { HorizonServer } from 'stellar-sdk/lib/horizon/server';
import Big from 'big.js';

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : '';
const NETWORK_PASSPHRASE = Networks.PUBLIC;
const MAX_TIME = Date.now() + 1000 * 60 * 10;
const SEQUENCE_SHIFT_IN_SECONDS = 240; // 4 minutes

export const horizonServer = new Horizon.Server(HORIZON_URL);

interface StellarBuildPaymentAndMergeTx {
  ephemeralAccountId: string;
  amountToAnchorUnits: string;
  paymentData: PaymentData;
  tokenConfigStellar: StellarTokenDetails;
}

export async function buildPaymentAndMergeTx({
  ephemeralAccountId,
  amountToAnchorUnits,
  paymentData,
  tokenConfigStellar,
}: StellarBuildPaymentAndMergeTx ): Promise<{
  paymentTransaction: string;
  mergeAccountTransaction: string;
  expectedSequenceNumber: string;
  createAccountTransaction: string;
}> {
  const baseFee = STELLAR_BASE_FEE;
  const maxTime = Date.now() + 1000 * 60 * 10;

  if (!FUNDING_SECRET) {
    console.log('Secret not defined');
    throw new Error('Stellar funding secret not defined');
  }

  const expectedSequenceNumber = await getFutureShiftedLedgerSequence(horizonServer, 32);

  const ephemeralAccount = new Account(ephemeralAccountId, String(expectedSequenceNumber));

  const fundingAccountKeypair = Keypair.fromSecret(FUNDING_SECRET);

  const { memo, memoType, anchorTargetAccount } = paymentData;
  const transactionMemo = memoType === 'text' ? Memo.text(memo) : Memo.hash(Buffer.from(memo, 'base64'));

  const fundingAccount = await horizonServer.loadAccount(fundingAccountKeypair.publicKey());

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
    .setMinAccountSequence(String(0))
    .build();

  createAccountTransaction.sign(fundingAccountKeypair);

  const paymentTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: STELLAR_BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        amount: amountToAnchorUnits,
        asset: new Asset(
          tokenConfigStellar.stellarAsset.code.string,
          tokenConfigStellar.stellarAsset.issuer.stellarEncoding,
        ),
        destination: anchorTargetAccount,
      }),
    )
    .addMemo(transactionMemo)
    .setTimebounds(0, MAX_TIME)
    .setMinAccountSequence(String(0))
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
    .setMinAccountSequence(String(1n))
    .build();

  paymentTransaction.sign(fundingAccountKeypair);
  mergeAccountTransaction.sign(fundingAccountKeypair);

  return {
    createAccountTransaction: createAccountTransaction.toEnvelope().toXDR().toString('base64'),
    paymentTransaction: paymentTransaction.toEnvelope().toXDR().toString('base64'),
    mergeAccountTransaction: mergeAccountTransaction.toEnvelope().toXDR().toString('base64'),
    expectedSequenceNumber: String(expectedSequenceNumber),
  };
}

async function getFutureShiftedLedgerSequence(horizonServer: HorizonServer, shiftAmount = 32) {
  try {
    const latestLedger = await horizonServer.ledgers().order('desc').limit(1).call();

    const currentLedgerSequence = latestLedger.records[0].sequence;

    const ledgersIn5Minutes = Math.ceil(SEQUENCE_SHIFT_IN_SECONDS / 7);

    const futureLedgerSequence = currentLedgerSequence + ledgersIn5Minutes;

    const bigFutureLedger = new Big(futureLedgerSequence);
    const bigShift = new Big(2).pow(shiftAmount);
    const shiftedSequence = bigFutureLedger.times(bigShift).toFixed();

    return shiftedSequence;
  } catch (error) {
    console.error('Error fetching and calculating ledger sequence:', error);
    throw error;
  }
}
