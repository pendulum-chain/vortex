import { Transaction, Keypair, Networks } from 'stellar-sdk';
import { keccak256 } from 'viem/utils';
import { Keyring } from '@polkadot/api';

import { fetchSep10Signatures, fetchSigningServiceAccountId, SignerServiceSep10Request } from '../signingService';
import { OutputTokenDetails, OutputTokenType } from '../../constants/tokenConfig';
import { EventStatus } from '../../components/GenericEvent';

import { OUTPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
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
    const keyValue = tomlFileContent.find((line) => line.includes(key));
    return keyValue?.split('=')[1].trim().replaceAll('"', '');
  };

  return {
    signingKey: findValueInToml('SIGNING_KEY'),
    webAuthEndpoint: findValueInToml('WEB_AUTH_ENDPOINT'),
    sep24Url: findValueInToml('TRANSFER_SERVER_SEP0024'),
    sep6Url: findValueInToml('TRANSFER_SERVER'),
    kycServer: findValueInToml('KYC_SERVER'),
  };
};

// Returns the hash value for the address. If it's a polkadot address, it will return raw data of the address.
function getHashValueForAddress(address: string) {
  if (address.startsWith('0x')) {
    return address as `0x${string}`;
  } else {
    const keyring = new Keyring({ type: 'sr25519' });
    return keyring.decodeAddress(address);
  }
}

//A memo derivation.
async function deriveMemoFromAddress(address: string) {
  const hashValue = getHashValueForAddress(address);
  const hash = keccak256(hashValue);
  return BigInt(hash).toString().slice(0, 15);
}

// Return the URLSearchParams and the account (master/omnibus or ephemeral) that was used for SEP-10
async function getUrlParams(
  ephemeralAccount: string,
  usesMemo: boolean,
  supportsClientDomain: boolean,
  address: string,
): Promise<{ urlParams: URLSearchParams; sep10Account: string }> {
  let sep10Account: string;
  const params = new URLSearchParams();

  if (usesMemo) {
    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/sep10`);

    if (!response.ok) {
      throw new Error('Failed to fetch client master SEP-10 public account.');
    }

    const { masterSep10Public } = await response.json();

    if (!masterSep10Public) {
      throw new Error('masterSep10Public not found in response.');
    }

    sep10Account = masterSep10Public;
    params.append('account', sep10Account);
    params.append('memo', await deriveMemoFromAddress(address));
  } else {
    sep10Account = ephemeralAccount;
    params.append('account', sep10Account);
  }

  if (supportsClientDomain) {
    params.append('client_domain', config.applicationClientDomain);
  }

  return {
    urlParams: params,
    sep10Account,
  };
}

const sep10SignaturesWithLoginRefresh = async (
  refreshFunction: () => Promise<void>,
  args: SignerServiceSep10Request,
) => {
  try {
    return await fetchSep10Signatures(args);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid signature') {
      await refreshFunction();
      return await fetchSep10Signatures(args);
    }
    throw new Error('Could not fetch sep 10 signatures from backend');
  }
};

export const sep10 = async (
  tomlValues: TomlValues,
  stellarEphemeralSecret: string,
  outputToken: OutputTokenType,
  address: string,
  checkAndWaitForSignature: () => Promise<void>,
  forceRefreshAndWaitForSignature: () => Promise<void>,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<{ token: string; sep10Account: string }> => {
  const { signingKey, webAuthEndpoint } = tomlValues;

  if (!exists(signingKey) || !exists(webAuthEndpoint)) {
    throw new Error('sep10: Missing values in TOML file');
  }
  const NETWORK_PASSPHRASE = Networks.PUBLIC;
  const ephemeralKeys = Keypair.fromSecret(stellarEphemeralSecret);
  const accountId = ephemeralKeys.publicKey();

  const { usesMemo, supportsClientDomain } = OUTPUT_TOKEN_CONFIG[outputToken];

  // will select either clientMaster or the ephemeral account
  const { urlParams, sep10Account } = await getUrlParams(accountId, usesMemo, supportsClientDomain, address);

  const challenge = await fetch(`${webAuthEndpoint}?${urlParams.toString()}`);
  if (challenge.status !== 200) {
    throw new Error(`sep10: Failed to fetch SEP-10 challenge: ${challenge.statusText}`);
  }

  const { transaction, network_passphrase } = await challenge.json();
  if (network_passphrase !== NETWORK_PASSPHRASE) {
    throw new Error(`sep10: Invalid network passphrase: ${network_passphrase}`);
  }

  const transactionSigned = new Transaction(transaction, NETWORK_PASSPHRASE);
  if (transactionSigned.source !== signingKey) {
    throw new Error(`sep10: Invalid source account: ${transactionSigned.source}`);
  }
  if (transactionSigned.sequence !== '0') {
    throw new Error(`sep10: Invalid sequence number: ${transactionSigned.sequence}`);
  }

  if (usesMemo) {
    await checkAndWaitForSignature();
  }

  const { masterClientSignature, clientSignature, clientPublic } = await sep10SignaturesWithLoginRefresh(
    forceRefreshAndWaitForSignature,
    {
      challengeXDR: transactionSigned.toXDR(),
      outToken: outputToken,
      clientPublicKey: sep10Account,
      usesMemo,
      address: address,
    },
  );

  if (supportsClientDomain) {
    transactionSigned.addSignature(clientPublic, clientSignature);
  }

  if (!usesMemo) {
    transactionSigned.sign(ephemeralKeys);
  } else {
    transactionSigned.addSignature(sep10Account, masterClientSignature);
  }

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
  return { token, sep10Account };
};

export async function sep24First(
  sessionParams: IAnchorSessionParams,
  sep10Account: string,
  outputToken: OutputTokenType,
): Promise<ISep24Intermediate> {
  if (config.test.mockSep24) {
    return { url: 'https://www.example.com', id: '1234' };
  }

  const { token, tomlValues } = sessionParams;
  const { sep24Url } = tomlValues;

  const { usesMemo } = OUTPUT_TOKEN_CONFIG[outputToken];

  let sep24Params;
  if (usesMemo) {
    sep24Params = new URLSearchParams({
      asset_code: sessionParams.tokenConfig.stellarAsset.code.string,
      amount: sessionParams.offrampAmount,
      account: sep10Account, // THIS is a particularity of Anclap. Should be able to work just with the epmhemeral account
      // or at least the anchor should be able to get it from the JWT.
      // Since we signed with the master/omnibus from the service, we need to specify the corresponding public here
      // memo: deriveMemoFromAddress(address!),
      // memo_type: 'id',
    });
  } else {
    sep24Params = new URLSearchParams({
      asset_code: sessionParams.tokenConfig.stellarAsset.code.string,
      amount: sessionParams.offrampAmount,
    });
  }

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
