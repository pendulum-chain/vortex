import { HORIZON_URL, PaymentData, STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS, StellarTokenDetails } from "@packages/shared";
import Big from "big.js";
import { Account, Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "stellar-sdk";
import logger from "../../../../config/logger";
import {
  FUNDING_SECRET,
  SEQUENCE_TIME_WINDOW_IN_SECONDS,
  SEQUENCE_TIME_WINDOWS,
  STELLAR_BASE_FEE
} from "../../../../constants/constants";

// Define HorizonServer type
type HorizonServer = Horizon.Server;

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : "";
const NETWORK_PASSPHRASE = Networks.PUBLIC;
const APPROXIMATE_STELLAR_LEDGER_CLOSE_TIME_SECONDS = 7;

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
  tokenConfigStellar
}: StellarBuildPaymentAndMergeTx): Promise<{
  expectedSequenceNumber: string;
  paymentTransactions: Array<{ sequence: string; tx: string }>;
  mergeAccountTransactions: Array<{ sequence: string; tx: string }>;
  createAccountTransactions: Array<{ sequence: string; tx: string }>;
}> {
  const baseFee = STELLAR_BASE_FEE;
  const maxTime = Date.now() + 1000 * 60 * 10;
  const NUMBER_OF_PRESIGNED_TXS = 5;

  if (!FUNDING_SECRET) {
    logger.error("Stellar funding secret not defined");
    throw new Error("Stellar funding secret not defined");
  }

  const fundingAccountKeypair = Keypair.fromSecret(FUNDING_SECRET);

  const { memo, memoType, anchorTargetAccount } = paymentData;
  const transactionMemo = memoType === "text" ? Memo.text(memo) : Memo.hash(Buffer.from(memo, "base64"));

  const fundingAccount = await horizonServer.loadAccount(fundingAccountKeypair.publicKey());

  // Define timeframes for each presigned transaction
  const timeWindows = [
    SEQUENCE_TIME_WINDOWS.FIRST_TX,
    SEQUENCE_TIME_WINDOWS.SECOND_TX,
    SEQUENCE_TIME_WINDOWS.THIRD_TX,
    SEQUENCE_TIME_WINDOWS.FOURTH_TX,
    SEQUENCE_TIME_WINDOWS.FIFTH_TX
  ];

  const sequenceNumbers: string[] = [];
  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const sequenceNumber = await getFutureShiftedLedgerSequence(horizonServer, 32, timeWindows[i]);
    sequenceNumbers.push(sequenceNumber);
  }

  const expectedSequenceNumber = sequenceNumbers[0]; // Use first sequence number as expected

  const paymentTransactions: Array<{ sequence: string; tx: string }> = [];
  const mergeAccountTransactions: Array<{ sequence: string; tx: string }> = [];
  const createAccountTransactions: Array<{ sequence: string; tx: string }> = [];

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const timeWindow = timeWindows[i];
    const maxTimeForTx = Date.now() + timeWindow * 1000; // Convert seconds to milliseconds
    const currentFundingAccount =
      i === 0
        ? fundingAccount
        : new Account(fundingAccountKeypair.publicKey(), String(BigInt(fundingAccount.sequenceNumber()) + BigInt(i)));

    const currentCreateAccountTransaction = new TransactionBuilder(currentFundingAccount, {
      fee: baseFee,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(
        Operation.createAccount({
          destination: ephemeralAccountId,
          startingBalance: STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS
        })
      )
      .addOperation(
        Operation.setOptions({
          highThreshold: 2,
          lowThreshold: 2,
          medThreshold: 2,
          signer: {
            ed25519PublicKey: fundingAccountKeypair.publicKey(),
            weight: 1
          },
          source: ephemeralAccountId
        })
      )
      .addOperation(
        Operation.changeTrust({
          asset: new Asset(tokenConfigStellar.stellarAsset.code.string, tokenConfigStellar.stellarAsset.issuer.stellarEncoding),
          source: ephemeralAccountId
        })
      )
      .setTimebounds(0, maxTimeForTx)
      .setMinAccountSequence(String(0))
      .build();

    currentCreateAccountTransaction.sign(fundingAccountKeypair);

    createAccountTransactions.push({
      sequence: fundingAccount.sequenceNumber(), // TODO do we require this?
      tx: currentCreateAccountTransaction.toEnvelope().toXDR().toString("base64")
    });
  }

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const timeWindow = timeWindows[i];
    const maxTimeForTx = Date.now() + timeWindow * 1000; // Convert seconds to milliseconds
    const currentSequence = sequenceNumbers[i];
    const currentEphemeralAccount = new Account(ephemeralAccountId, currentSequence);

    const currentPaymentTransaction = new TransactionBuilder(currentEphemeralAccount, {
      fee: STELLAR_BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(
        Operation.payment({
          amount: amountToAnchorUnits,
          asset: new Asset(tokenConfigStellar.stellarAsset.code.string, tokenConfigStellar.stellarAsset.issuer.stellarEncoding),
          destination: anchorTargetAccount
        })
      )
      .addMemo(transactionMemo)
      .setTimebounds(0, maxTimeForTx)
      .setMinAccountSequence(String(0))
      .build();

    currentPaymentTransaction.sign(fundingAccountKeypair);

    const currentMergeAccountTransaction = new TransactionBuilder(currentEphemeralAccount, {
      fee: STELLAR_BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(
        Operation.changeTrust({
          asset: new Asset(tokenConfigStellar.stellarAsset.code.string, tokenConfigStellar.stellarAsset.issuer.stellarEncoding),
          limit: "0"
        })
      )
      .addOperation(
        Operation.accountMerge({
          destination: FUNDING_PUBLIC_KEY
        })
      )
      .setTimebounds(0, maxTimeForTx)
      .setMinAccountSequence(String(1n))
      .build();

    currentMergeAccountTransaction.sign(fundingAccountKeypair);

    paymentTransactions.push({
      sequence: currentSequence,
      tx: currentPaymentTransaction.toEnvelope().toXDR().toString("base64")
    });

    mergeAccountTransactions.push({
      sequence: currentSequence,
      tx: currentMergeAccountTransaction.toEnvelope().toXDR().toString("base64")
    });
  }

  return {
    createAccountTransactions,
    expectedSequenceNumber: String(expectedSequenceNumber),
    mergeAccountTransactions,
    paymentTransactions
  };
}

async function getFutureShiftedLedgerSequence(
  horizonServer: HorizonServer,
  shiftAmount = 32,
  timeWindowSeconds = SEQUENCE_TIME_WINDOW_IN_SECONDS
) {
  try {
    const latestLedger = await horizonServer.ledgers().order("desc").limit(1).call();

    const currentLedgerSequence = latestLedger.records[0].sequence;

    const ledgersInTimeWindow = Math.ceil(timeWindowSeconds / APPROXIMATE_STELLAR_LEDGER_CLOSE_TIME_SECONDS);

    const futureLedgerSequence = currentLedgerSequence + ledgersInTimeWindow;

    const bigFutureLedger = new Big(futureLedgerSequence);
    const bigShift = new Big(2).pow(shiftAmount);
    const shiftedSequence = bigFutureLedger.times(bigShift).toFixed();

    return shiftedSequence;
  } catch (error) {
    console.error("Error fetching and calculating ledger sequence:", error);
    throw error;
  }
}
