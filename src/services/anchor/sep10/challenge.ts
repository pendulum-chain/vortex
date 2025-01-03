import { Transaction, Networks, Memo, Operation, MemoType } from 'stellar-sdk';

interface Sep10Challenge {
  transaction: string;
  network_passphrase: string;
}

async function validateChallenge(
  transaction: Transaction<Memo<MemoType>, Operation[]>,
  signingKey: string,
  networkPassphrase: string,
): Promise<void> {
  if (transaction.source !== signingKey) {
    throw new Error(`sep10: Invalid source account: ${transaction.source}`);
  }
  if (transaction.sequence !== '0') {
    throw new Error(`sep10: Invalid sequence number: ${transaction.sequence}`);
  }
  if (networkPassphrase !== Networks.PUBLIC) {
    throw new Error(`sep10: Invalid network passphrase: ${networkPassphrase}`);
  }
}

export async function fetchAndValidateChallenge(
  webAuthEndpoint: string,
  urlParams: URLSearchParams,
  signingKey: string,
): Promise<Transaction<Memo<MemoType>, Operation[]>> {
  const challenge = await fetch(`${webAuthEndpoint}?${urlParams.toString()}`);
  if (challenge.status !== 200) {
    throw new Error(`sep10: Failed to fetch SEP-10 challenge: ${challenge.statusText}`);
  }

  const { transaction, network_passphrase } = (await challenge.json()) as Sep10Challenge;
  const transactionSigned = new Transaction(transaction, Networks.PUBLIC);
  await validateChallenge(transactionSigned, signingKey, network_passphrase);

  return transactionSigned;
}
