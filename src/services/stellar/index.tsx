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
import { TokenDetails } from '../../constants/tokenConfig';
import { Buffer } from 'buffer';
import { getEphemeralKeys } from '../anchor';

import { storageService } from '../localStorage';
import { storageKeys } from '../../constants/localStorage';

const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;
import { EventStatus } from '../../components/GenericEvent';

export interface StellarOperations {
  offrampingTransaction: Transaction;
  mergeAccountTransaction: Transaction;
}

type StellarFundingSignatureResponse = {
  signature: string[];
  public: string;
  sequence: string;
};

export async function setUpAccountAndOperations(
  fundingAccountPk: string,
  sepResult: SepResult,
  tokenConfig: TokenDetails,
): Promise<StellarOperations> {

  const ephemeralKeys = getEphemeralKeys();
  const ephemeralAccountId = ephemeralKeys.publicKey();
  const ephemeralAccount = await horizonServer.loadAccount(ephemeralAccountId);
  const { offrampingTransaction, mergeAccountTransaction } = await createOfframpAndMergeTransaction(
    fundingAccountPk,
    sepResult,
    ephemeralKeys,
    ephemeralAccount,
    tokenConfig,
  );
  return { offrampingTransaction, mergeAccountTransaction };
}

export async function setupStellarAccount(
  fundingAccountPk: string,
  tokenConfig: TokenDetails,
) {
  const ephemeralKeys = getEphemeralKeys();
  const ephemeralAccountId = ephemeralKeys.publicKey();

  // Check if the account already exists, recovery safeguard.
  try{
    const ephemeralAccountInitial = await horizonServer.loadAccount(ephemeralAccountId);
    if (ephemeralAccountInitial) {
      return ephemeralAccountInitial
    }

  }catch{
    // The account does not exist, we need to create it. No further operation.
  }

  // To make the transaction deterministic, we need to set absoulte timebounds
  // We set the max time to 10 minutes from now
  const maxTime = Date.now() + 1000 * 60 * 10;

  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId: ephemeralAccountId, maxTime, assetCode: tokenConfig.assetCode }),
  });

  if (!response.ok) {
    throw new Error(`Error while fetching funding account signature`);
  }
  const responseData: StellarFundingSignatureResponse = await response.json();

  // The funding account with sequene as per received from the server
  // This will be valid as long as teh funding account does not make
  // a transaction in the meantime
  const fundingAccount = new Account(fundingAccountPk, responseData.sequence);

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
          signer: { ed25519PublicKey: fundingAccountPk, weight: 1 },
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
  } catch (error) {
    console.error(error);
    throw new Error('Could not create the account creation transaction');
  }

  createAccountTransaction.addSignature(fundingAccountPk, responseData.signature[0]);
  createAccountTransaction.sign(ephemeralKeys);

  try {
    await horizonServer.submitTransaction(createAccountTransaction);
  } catch (error: unknown) {
    const horizonError = error as { response: { data: { extras: any } } };
    console.log(horizonError.response.data.extras)
    console.error(horizonError.response.data.extras.toString());
    throw new Error('Could not submit the account creation transaction');
  }

  const ephemeralAccount = await horizonServer.loadAccount(ephemeralAccountId);

  return ephemeralAccount;
}

async function createOfframpAndMergeTransaction(
  fundingAccountPk: string,
  sepResult: SepResult,
  ephemeralKeys: Keypair,
  ephemeralAccount: Account,
  tokenConfig: TokenDetails,
) {
  // We allow for more TTL since the redeem may take time
  const maxTime = Date.now() + 1000 * 60 * 30;
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

  // this operation would run completely in the browser
  // that is where the signature of the ephemeral account is added
  const offrampingTransaction = new TransactionBuilder(ephemeralAccount, {
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

  // this operation would run completely in the browser
  // that is where the signature of the ephemeral account is added
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
        destination: fundingAccountPk,
      }),
    )
    .setTimebounds(0, maxTime)
    .build();

  // Fetch the signatures from the server
  // Under this endpoint, it will return first first the signature of the offramp payment
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
      assetCode: tokenConfig.assetCode,
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

  storageService.set(storageKeys.STELLAR_OPERATIONS, {offrampingTransaction, mergeAccountTransaction})

  return { offrampingTransaction, mergeAccountTransaction };
}

// Recovery behaviour: If the offramp transaction was already submitted, we will get a sequence error.
// if we are on recovery mode we can ignore this error.
// Alternative improvement: check the balance of the destination (offramp) account to see if the funds arrived.
export async function submitOfframpTransaction(
  offrampingTransaction: Transaction,
  isRecovery: boolean,
  renderEvent: (event: string, status: EventStatus) => void,
) {
  try {
    await horizonServer.submitTransaction(offrampingTransaction);
  } catch (error) {
    const horizonError = error as { response: { data: { extras: any } } };
    
    console.log(`Could not submit the offramp transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`)
    // check https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/transactions
    if (isRecovery && horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
      console.log('Recovery mode: Offramp already performed.');
      return;
    }
    
    console.error(horizonError.response.data.extras);
    throw new Error('Could not submit the offramping transaction');
  }
}

export async function cleanupStellarEphemeral(
  mergeAccountTransaction: Transaction,
  renderEvent: (event: string, status: EventStatus) => void,
) {
  try {
    await horizonServer.submitTransaction(mergeAccountTransaction);
  } catch (error) {
    const horizonError = error as { response: { data: { extras: any } } };
    renderEvent(
      `Could not submit the cleanup transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
      EventStatus.Error,
    );

    console.error('Could not submit the cleanup transaction');
    console.error(horizonError.response.data.extras);
    throw new Error('Could not submit the cleanup transaction');
  }
}
