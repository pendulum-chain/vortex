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
import { Sep24Result } from '../anchor';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { TokenDetails } from '../../constants/tokenConfig';
import { Buffer } from 'buffer';

const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.TESTNET;
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
  sep24Result: Sep24Result,
  ephemeralKeys: Keypair,
  tokenConfig: TokenDetails,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<StellarOperations> {
  await setupStellarAccount(fundingAccountPk, ephemeralKeys, tokenConfig, renderEvent);

  const ephemeralAccountId = ephemeralKeys.publicKey();
  const ephemeralAccount = await horizonServer.loadAccount(ephemeralAccountId);
  const { offrampingTransaction, mergeAccountTransaction } = await createOfframpAndMergeTransaction(
    fundingAccountPk,
    sep24Result,
    ephemeralKeys,
    ephemeralAccount,
    tokenConfig,
  );
  return { offrampingTransaction, mergeAccountTransaction };
}

async function setupStellarAccount(
  fundingAccountPk: string,
  ephemeralKeys: Keypair,
  tokenConfig: TokenDetails,
  renderEvent: (event: string, status: EventStatus) => void,
) {
  const ephemeralAccountId = ephemeralKeys.publicKey();

  // To make the transaction deterministic, we need to set absoulte timebounds
  // We set the max time to 10 minutes from now
  const maxTime = Date.now() + 1000 * 60 * 10;

  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId: ephemeralAccountId, maxTime, assetId: tokenConfig.assetCode }),
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
    renderEvent(`Could not create the account creation transaction. ${error}`, EventStatus.Error);
    throw new Error('Could not create the account creation transaction');
  }

  createAccountTransaction.addSignature(fundingAccountPk, responseData.signature[0]);
  createAccountTransaction.sign(ephemeralKeys);

  try {
    await horizonServer.submitTransaction(createAccountTransaction);
  } catch (error: unknown) {
    const horizonError = error as { response: { data: { extras: any } } };
    console.error(horizonError.response.data.extras.toString());
    renderEvent(
      `Could not submit the account creation transaction. ${JSON.stringify(
        horizonError.response.data.extras.result_codes,
      )}`,
      EventStatus.Error,
    );
    throw new Error('Could not submit the account creation transaction');
  }

  const ephemeralAccount = await horizonServer.loadAccount(ephemeralAccountId);

  return ephemeralAccount;
}

async function createOfframpAndMergeTransaction(
  fundingAccountPk: string,
  sep24Result: Sep24Result,
  ephemeralKeys: Keypair,
  ephemeralAccount: Account,
  tokenConfig: TokenDetails,
) {
  // We allow for more TTL since the redeem may take time
  const maxTime = Date.now() + 1000 * 60 * 30;
  const sequence = ephemeralAccount.sequenceNumber();
  const { amount, memo, memoType, offrampingAccount } = sep24Result;

  //cast the memo to corresponding type
  let transactionMemo;
  switch (memoType) {
    case "text":
      transactionMemo = Memo.text(memo);
      break;

    case "hash":
      transactionMemo = Memo.hash(Buffer.from(memo, "base64"));
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
    body: JSON.stringify({ accountId: ephemeralAccount.accountId(), paymentData: sep24Result, sequence, maxTime, assetId: tokenConfig.assetCode }),
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

export async function submitOfframpTransaction(
  offrampingTransaction: Transaction,
  renderEvent: (event: string, status: EventStatus) => void,
) {
  try {
    await horizonServer.submitTransaction(offrampingTransaction);
  } catch (error) {
    const horizonError = error as { response: { data: { extras: any } } };
    renderEvent(
      `Could not submit the offramp transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
      EventStatus.Error,
    );

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
