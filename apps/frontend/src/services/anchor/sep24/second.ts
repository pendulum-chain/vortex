import { config } from '../../../config';
import { IAnchorSessionParams, ISep24Intermediate, SepResult } from '../../../types/sep';
import { fetchSigningServiceAccountId } from '../../signingService';

interface Sep24TransactionStatus {
  status: string;
  amount_in: string;
  withdraw_memo: string;
  withdraw_memo_type: string;
  withdraw_anchor_account: string;
}

const POLLING_INTERVAL = 1000;

async function fetchTransactionStatus(id: string, token: string, sep24Url: string): Promise<Sep24TransactionStatus> {
  const idParam = new URLSearchParams({ id });
  const statusResponse = await fetch(`${sep24Url}/transaction?${idParam.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (statusResponse.status !== 200) {
    throw new Error(`Failed to fetch SEP-24 status: ${statusResponse.statusText}`);
  }

  const { transaction } = await statusResponse.json();
  return transaction;
}

async function pollTransactionStatus(id: string, sessionParams: IAnchorSessionParams): Promise<Sep24TransactionStatus> {
  const { token, tomlValues } = sessionParams;
  let status: Sep24TransactionStatus;

  if (!tomlValues.sep24Url) {
    throw new Error('Missing SEP-24 URL in TOML values');
  }

  do {
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
    status = await fetchTransactionStatus(id, token, tomlValues.sep24Url);
  } while (status.status !== 'pending_user_transfer_start');

  return status;
}

export async function sep24Second(
  sep24Values: ISep24Intermediate,
  sessionParams: IAnchorSessionParams,
): Promise<SepResult> {
  if (config.test.mockSep24) {
    // sleep 10 secs
    await new Promise((resolve) => setTimeout(resolve, 10000));
    return {
      amount: sessionParams.offrampAmount,
      memo: 'MYK1722323689',
      memoType: 'text',
      offrampingAccount: (await fetchSigningServiceAccountId()).stellar.public,
    };
  }

  const status = await pollTransactionStatus(sep24Values.id, sessionParams);

  return {
    amount: status.amount_in,
    memo: status.withdraw_memo,
    memoType: status.withdraw_memo_type,
    offrampingAccount: status.withdraw_anchor_account,
  };
}
