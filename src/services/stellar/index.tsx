/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  Asset,
  Memo,
  Transaction,
  Account,
} from 'stellar-sdk';
import { HORIZON_URL, BASE_FEE } from '../../constants/constants';
import { SepResult } from '../anchor';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { OUTPUT_TOKEN_CONFIG, OutputTokenDetails, OutputTokenType } from '../../constants/tokenConfig';
import { Buffer } from 'buffer';

const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;
import { OfframpingState } from '../offrampingFlow';
import { fetchSigningServiceAccountId } from '../signingService';

export interface StellarOperations {
  offrampingTransaction: Transaction;
  mergeAccountTransaction: Transaction;
}

type StellarFundingSignatureResponse = {
  signature: string[];
  public: string;
  sequence: string;
};

export async function stellarCreateEphemeral(
  stellarEphemeralSecret: string,
  outputTokenType: OutputTokenType,
): Promise<void> {
  const fundingAccountId = (await fetchSigningServiceAccountId()).stellar.public;
  const ephemeralAccountExists = await isEphemeralCreated(stellarEphemeralSecret);

  if (!ephemeralAccountExists) {
    await setupStellarAccount(fundingAccountId, stellarEphemeralSecret, outputTokenType);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (await isEphemeralCreated(stellarEphemeralSecret)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function isEphemeralCreated(stellarEphemeralSecret: string): Promise<boolean> {
  const ephemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
  const ephemeralAccountId = ephemeralKeypair.publicKey();

  try {
    await horizonServer.loadAccount(ephemeralAccountId);
    return true;
  } catch {
    return false;
  }
}

export async function setUpAccountAndOperations(
  fundingAccountId: string,
  ephemeralKeypair: Keypair,
  sepResult: SepResult,
  outputTokenType: OutputTokenType,
): Promise<StellarOperations> {
  const ephemeralAccount = await horizonServer.loadAccount(ephemeralKeypair.publicKey());
  const { offrampingTransaction, mergeAccountTransaction } = await createOfframpAndMergeTransaction(
    fundingAccountId,
    sepResult,
    ephemeralKeypair,
    ephemeralAccount,
    OUTPUT_TOKEN_CONFIG[outputTokenType],
  );
  return { offrampingTransaction, mergeAccountTransaction };
}

async function setupStellarAccount(
  fundingAccountId: string,
  ephemeralSecret: string,
  outputTokenType: OutputTokenType,
) {
  const ephemeralKeypair = Keypair.fromSecret(ephemeralSecret);
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];
  const ephemeralAccountId = ephemeralKeypair.publicKey();

  // To make the transaction deterministic, we need to set absoulte timebounds
  // We set the max time to 10 minutes from now
  const maxTime = Date.now() + 1000 * 60 * 10;

  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId: ephemeralAccountId,
      maxTime,
      assetCode: outputToken.stellarAsset.code.stringRaw,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error while fetching funding account signature`);
  }
  const responseData: StellarFundingSignatureResponse = await response.json();

  // The funding account with sequene as per received from the server
  // This will be valid as long as teh funding account does not make
  // a transaction in the meantime
  const fundingAccount = new Account(fundingAccountId, responseData.sequence);

  // add a setOption oeration in order to make this a 2-of-2 multisig account where the
  // funding account is a cosigner
  let createAccountTransaction: Transaction;
  try {
    createAccountTransaction = new TransactionBuilder(fundingAccount, {
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
          asset: new Asset(
            outputToken.stellarAsset.code.stringStellar,
            outputToken.stellarAsset.issuer.stellarEncoding,
          ),
        }),
      )
      .setTimebounds(0, maxTime)
      .build();
  } catch (error) {
    console.error(error);
    throw new Error('Could not create the account creation transaction');
  }

  createAccountTransaction.addSignature(fundingAccountId, responseData.signature[0]);
  createAccountTransaction.sign(ephemeralKeypair);

  try {
    await horizonServer.submitTransaction(createAccountTransaction);
  } catch (error: unknown) {
    const horizonError = error as { response: { data: { extras: any } } };
    console.log(horizonError.response.data.extras);
    console.error(horizonError.response.data.extras.toString());
    throw new Error('Could not submit the account creation transaction');
  }
}

async function createOfframpAndMergeTransaction(
  fundingAccountId: string,
  sepResult: SepResult,
  ephemeralKeys: Keypair,
  ephemeralAccount: Account,
  { stellarAsset: { code, issuer } }: OutputTokenDetails,
) {
  // We allow for a TLL of up to two weeks so we are able to recover it in case of failure
  const maxTime = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const sequence = ephemeralAccount.sequenceNumber();
  const { amount, memo, memoType, offrampingAccount } = sepResult;

  //cast the memo to corresponding type
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

  const stellarAsset = new Asset(code.stringStellar, issuer.stellarEncoding);

  // this operation would run completely in the browser
  // that is where the signature of the ephemeral account is added
  const offrampingTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        amount,
        asset: stellarAsset,
        destination: offrampingAccount,
      }),
    )
    .addMemo(transactionMemo)
    .setTimebounds(0, maxTime)
    .build();

  // this operation would run completely in the browser
  // that is where the signature of the ephemeral account is added
  const mergeAccountTransaction = new TransactionBuilder(ephemeralAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: stellarAsset,
        limit: '0',
      }),
    )
    .addOperation(
      Operation.accountMerge({
        destination: fundingAccountId,
      }),
    )
    .setTimebounds(0, maxTime)
    .build();

  // Fetch the signatures from the server
  // Under this endpoint, it will return first the signature of the offramp payment
  // with information provided, then the signature of the merge account operation

  // We also provide the ephemeral account's sequence number. This is more controlled
  // and transactions should be valid as long as they are executed in the proper order.
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId: ephemeralAccount.accountId(),
      paymentData: sepResult,
      sequence,
      maxTime,
      assetCode: code.stringRaw,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error while fetching funding account signature`);
  }

  const responseData: StellarFundingSignatureResponse = await response.json();

  // append signatures from server, and sign
  offrampingTransaction.addSignature(responseData.public, responseData.signature[0]);
  offrampingTransaction.sign(ephemeralKeys);

  mergeAccountTransaction.addSignature(responseData.public, responseData.signature[1]);
  mergeAccountTransaction.sign(ephemeralKeys);

  return { offrampingTransaction, mergeAccountTransaction };
}

// Recovery behaviour: If the offramp transaction was already submitted, we will get a sequence error.
// if we are on recovery mode we can ignore this error.
// Alternative improvement: check the balance of the destination (offramp) account to see if the funds arrived.
export async function stellarOfframp(state: OfframpingState): Promise<OfframpingState> {
  if (state.transactions === undefined) {
    throw new Error('Transactions not prepared');
  }

  try {
    const offrampingTransaction = new Transaction(state.transactions.stellarOfframpingTransaction, NETWORK_PASSPHRASE);
    await horizonServer.submitTransaction(offrampingTransaction);
  } catch (error) {
    const horizonError = error as { response: { data: { extras: any } } };

    console.log(
      `Could not submit the offramp transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
    );
    // check https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/transactions
    if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
      console.log('Recovery mode: Offramp already performed.');
    } else {
      console.error(horizonError.response.data.extras);
      throw new Error('Could not submit the offramping transaction');
    }
  }

  return { ...state, phase: 'stellarCleanup' };
}

export async function stellarCleanup(state: OfframpingState): Promise<OfframpingState> {
  if (state.transactions === undefined) {
    throw new Error('Transactions not prepared');
  }

  try {
    const mergeAccountTransaction = new Transaction(state.transactions.stellarCleanupTransaction, NETWORK_PASSPHRASE);
    await horizonServer.submitTransaction(mergeAccountTransaction);
  } catch (error) {
    const horizonError = error as { response: { data: { extras: any } } };
    console.log(
      `Could not submit the cleanup transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
    );

    if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
      console.log('Recovery mode: Cleanup already performed.');
    } else {
      console.error(horizonError.response.data.extras);
      throw new Error('Could not submit the cleanup transaction');
    }
  }

  return {
    ...state,
    phase: 'success',
  };
}
