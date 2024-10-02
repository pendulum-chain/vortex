import { Transaction, Keypair, Networks } from 'stellar-sdk';
import { EventStatus } from '../../components/GenericEvent';
import { OutputTokenDetails } from '../../constants/tokenConfig';
import { fetchSigningServiceAccountId } from '../signingService';
import { config } from '../../config';

interface TomlValues {
  signingKey?: string;
  webAuthEndpoint?: string;
  sep24Url?: string;
  sep6Url?: string;
  kycServer?: string;
}

export interface ISep24Intermediate {
  url: string;
  id: string;
}

export interface IAnchorSessionParams {
  token: string;
  tomlValues: TomlValues;
  tokenConfig: OutputTokenDetails;
  offrampAmount: string;
}

export interface SepResult {
  amount: string;
  memo: string;
  memoType: string;
  offrampingAccount: string;
}

export function createStellarEphemeralSecret() {
  const ephemeralKeys = Keypair.random();
  return ephemeralKeys.secret();
}

const exists = (value?: string | null): value is string => !!value && value?.length > 0;

export const fetchTomlValues = async (TOML_FILE_URL: string): Promise<TomlValues> => {
  const response = await fetch(TOML_FILE_URL);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch TOML file: ${response.statusText}`);
  }

  const tomlFileContent = (await response.text()).split('\n');
  const findValueInToml = (key: string): string | undefined => {
    for (const line of tomlFileContent) {
      const regexp = new RegExp(`^\\s*${key}\\s*=\\s*"(.*)"\\s*$`);
      const match = regexp.exec(line);
      if (match) {
        return match[1];
      }
    }
  };

  return {
    signingKey: findValueInToml('SIGNING_KEY'),
    webAuthEndpoint: findValueInToml('WEB_AUTH_ENDPOINT'),
    sep24Url: findValueInToml('TRANSFER_SERVER_SEP0024'),
    sep6Url: findValueInToml('TRANSFER_SERVER'),
    kycServer: findValueInToml('KYC_SERVER'),
  };
};

export const sep10 = async (
  tomlValues: TomlValues,
  stellarEphemeralSecret: string,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<string> => {
  const { signingKey, webAuthEndpoint } = tomlValues;

  if (!exists(signingKey) || !exists(webAuthEndpoint)) {
    throw new Error('Missing values in TOML file');
  }
  const NETWORK_PASSPHRASE = Networks.PUBLIC;
  const ephemeralKeys = Keypair.fromSecret(stellarEphemeralSecret);
  const accountId = ephemeralKeys.publicKey();
  const urlParams = new URLSearchParams({
    account: accountId,
  });

  const challenge = await fetch(`${webAuthEndpoint}?${urlParams.toString()}`);
  if (challenge.status !== 200) {
    throw new Error(`Failed to fetch SEP-10 challenge: ${challenge.statusText}`);
  }

  const { transaction, network_passphrase } = await challenge.json();
  if (network_passphrase !== NETWORK_PASSPHRASE) {
    throw new Error(`Invalid network passphrase: ${network_passphrase}`);
  }

  const transactionSigned = new Transaction(transaction, NETWORK_PASSPHRASE);
  if (transactionSigned.source !== signingKey) {
    throw new Error(`Invalid source account: ${transactionSigned.source}`);
  }
  if (transactionSigned.sequence !== '0') {
    throw new Error(`Invalid sequence number: ${transactionSigned.sequence}`);
  }

  // More tests required, ignore for prototype

  transactionSigned.sign(ephemeralKeys);

  const jwt = await fetch(webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: transactionSigned.toXDR().toString() }),
  });

  if (jwt.status !== 200) {
    throw new Error(`Failed to submit SEP-10 response: ${jwt.statusText}`);
  }

  const { token } = await jwt.json();

  // print the ephemeral secret, for testing
  renderEvent(
    `Unique recovery code (Please keep safe in case something fails): ${ephemeralKeys.secret()}`,
    EventStatus.Waiting,
  );
  return token;
};

// TODO modify according to the anchor's requirements and implementation
// we should be able to do the whole flow on this function since we have all the
// information we need
/*
export async function sep6First(sessionParams: IAnchorSessionParams): Promise<SepResult> {
  const { token, tomlValues } = sessionParams;
  const { sep6Url } = tomlValues;

  return {
    amount: '10.4',
    memo: 'a memo',
    memoType: 'text',
    offrampingAccount: 'GCUHGQ6LY3L2NAB7FX2LJGUJFCG6LKAQHVIMJLZNNBMCZUQNBPJTXE6O',
  };

  const sep6Params = new URLSearchParams({
    asset_code: sessionParams.tokenConfig.assetCode!,
    type: 'bank_account',
    dest: '3eE4729a-123B-45c6-8d7e-F9aD567b9c1e', // Ntokens crashes when sending destination, complains of not having it??
  });

  const fetchUrl = `${sep6Url}/withdraw?`;
  const sep6Response = await fetch(fetchUrl + sep6Params, {
    method: 'GET',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
  });
  console.log(sep6Response);
  if (sep6Response.status !== 200) {
    console.log(await sep6Response.json(), sep6Response.toString());
    throw new Error(`Failed to initiate SEP-6: ${sep6Response.statusText}`);
  }

  const { type, id } = await sep6Response.json();
  if (type !== 'interactive_customer_info_needed') {
    throw new Error(`Unexpected SEP-6 type: ${type}`);
  }
  //return { transactionId: id };
}*/

/*
export async function sep12First(sessionParams: IAnchorSessionParams): Promise<void> {
  const { token, tomlValues } = sessionParams;
  const { sep6Url } = tomlValues;

  const sep12Params = new URLSearchParams({
    account: '3eE4729a-123B-45c6-8d7e-F9aD567b9c1e',
  });

  const fetchUrl = `${sep6Url}/customer`;
  const sep12Response = await fetch(fetchUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
    body: sep12Params.toString(),
  });
  console.log(sep12Response);
  if (sep12Response.status !== 200) {
    console.log(await sep12Response.json(), sep12Response.toString());
    throw new Error(`Failed to initiate SEP-6: ${sep12Response.statusText}`);
  }
  //>????
}*/

export async function sep24First(sessionParams: IAnchorSessionParams): Promise<ISep24Intermediate> {
  if (config.test.mockSep24) {
    return { url: 'https://www.example.com', id: '1234' };
  }

  const { token, tomlValues } = sessionParams;
  const { sep24Url } = tomlValues;

  // at this stage, assetCode should be defined, if the config is consistent.
  const sep24Params = new URLSearchParams({
    asset_code: sessionParams.tokenConfig.stellarAsset.code.string,
    amount: sessionParams.offrampAmount,
  });

  const fetchUrl = `${sep24Url}/transactions/withdraw/interactive`;
  const sep24Response = await fetch(fetchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
    body: sep24Params.toString(),
  });
  if (sep24Response.status !== 200) {
    console.log(await sep24Response.json(), sep24Params.toString());
    throw new Error(`Failed to initiate SEP-24: ${sep24Response.statusText}`);
  }

  const { type, url, id } = await sep24Response.json();
  if (type !== 'interactive_customer_info_needed') {
    throw new Error(`Unexpected SEP-24 type: ${type}`);
  }

  return { url, id };
}

export async function sep24Second(
  sep24Values: ISep24Intermediate,
  sessionParams: IAnchorSessionParams,
): Promise<SepResult> {
  const { id } = sep24Values;
  const { token, tomlValues } = sessionParams;
  const { sep24Url } = tomlValues;

  if (config.test.mockSep24) {
    return {
      amount: sessionParams.offrampAmount,
      memo: 'MYK1722323689',
      memoType: 'text',
      offrampingAccount: (await fetchSigningServiceAccountId()).stellar.public,
    };
  }

  let status;
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const idParam = new URLSearchParams({ id });
    const statusResponse = await fetch(`${sep24Url}/transaction?${idParam.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (statusResponse.status !== 200) {
      throw new Error(`Failed to fetch SEP-24 status: ${statusResponse.statusText}`);
    }

    const { transaction } = await statusResponse.json();
    status = transaction;
  } while (status.status !== 'pending_user_transfer_start');

  return {
    amount: status.amount_in,
    memo: status.withdraw_memo,
    memoType: status.withdraw_memo_type,
    offrampingAccount: status.withdraw_anchor_account,
  };
}
