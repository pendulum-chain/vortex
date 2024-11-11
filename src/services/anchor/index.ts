import { Transaction, Keypair, Networks, Signer } from 'stellar-sdk';
import { EventStatus } from '../../components/GenericEvent';
import { OutputTokenDetails, OutputTokenType } from '../../constants/tokenConfig';
import { fetchSep10Signatures, fetchSigningServiceAccountId, SignerServiceSep10Request } from '../signingService';
import { SiweSignatureData } from '../../hooks/useSignChallenge';

import { config } from '../../config';
import { OUTPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import { SIGNING_SERVICE_URL } from '../../constants/constants';

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

// Return the URLSearchParams and the account (master/omnibus or ephemeral) that was used for SEP-10
async function getUrlParams(
  ephemeralAccount: string,
  usesMemo: boolean,
  address: `0x${string}`,
): Promise<{ urlParams: URLSearchParams; sep10Account: string }> {
  if (usesMemo) {
    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/sep10`);

    if (!response.ok) {
      throw new Error('Failed to fetch client master SEP-10 public account.');
    }
    const { masterSep10Public } = await response.json();
    if (!masterSep10Public) {
      throw new Error('masterSep10Public not found in response.');
    }

    const sep10Account = masterSep10Public;

    return {
      urlParams: new URLSearchParams({
        account: sep10Account,
        client_domain: config.applicationClientDomain,
        memo: deriveMemoFromAddress(address),
      }),
      sep10Account,
    };
  }
  return {
    urlParams: new URLSearchParams({ account: ephemeralAccount, client_domain: config.applicationClientDomain }),
    sep10Account: ephemeralAccount,
  };
}

const sep10SignaturesWithLoginRefresh = async (
  refreshFunction: () => Promise<SiweSignatureData>,
  args: SignerServiceSep10Request,
) => {
  try {
    console.log(args);
    return await fetchSep10Signatures(args);
  } catch (error: any) {
    console.log(error.message);
    if (error.message === 'Invalid signature') {
      let { nonce, signature } = await refreshFunction();
      console.log('new signature', signature);
      console.log('ne nonce ', nonce);
      let regreshedArgs = { ...args, maybeChallengeSignature: signature, maybeNonce: nonce };
      return await fetchSep10Signatures(regreshedArgs);
    }
    throw new Error('Could not fetch sep 10 signatures from backend');
  }
};

//TODO A very naive memo derivation for testing. NOT SECURE
const deriveMemoFromAddress = (address: `0x${string}`) => {
  return address.slice(5, 15).replace(/\D/g, '');
};

export const sep10 = async (
  tomlValues: TomlValues,
  stellarEphemeralSecret: string,
  outputToken: OutputTokenType,
  address: `0x${string}` | undefined,
  checkAndWaitForSignature: () => Promise<SiweSignatureData>,
  forceRefreshSiweSignature: () => Promise<SiweSignatureData>,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<{ token: string; sep10Account: string }> => {
  const { signingKey, webAuthEndpoint } = tomlValues;

  if (!exists(signingKey) || !exists(webAuthEndpoint)) {
    throw new Error('Missing values in TOML file');
  }
  const NETWORK_PASSPHRASE = Networks.PUBLIC;
  const ephemeralKeys = Keypair.fromSecret(stellarEphemeralSecret);
  const accountId = ephemeralKeys.publicKey();

  const { usesMemo } = OUTPUT_TOKEN_CONFIG[outputToken];

  // will select either clientMaster or the ephemeral account
  const { urlParams, sep10Account } = await getUrlParams(accountId, usesMemo, address!);
  const { supportsClientDomain } = OUTPUT_TOKEN_CONFIG[outputToken];

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

  let signatureData = await checkAndWaitForSignature();
  if (!signatureData) {
    throw new Error('Invalid stored challenge signature');
  }
  // undefined if not using memo
  let maybeNonce;
  let maybeChallengeSignature;
  if (signatureData && usesMemo) {
    maybeNonce = signatureData.nonce;
    maybeChallengeSignature = signatureData.signature;
  }
  // sign both for client_domain + an extra signature for Anclap workaround
  const { masterClientSignature, clientSignature, clientPublic } = await sep10SignaturesWithLoginRefresh(
    forceRefreshSiweSignature,
    {
      challengeXDR: transactionSigned.toXDR(),
      outToken: outputToken,
      clientPublicKey: sep10Account,
      maybeNonce,
      maybeChallengeSignature,
    },
  );

  if (supportsClientDomain) {
    transactionSigned.addSignature(clientPublic, clientSignature);
  }

  if (!usesMemo) {
    transactionSigned.sign(ephemeralKeys);
  } else {
    console.log(sep10Account);
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
    `Unique recovery code (Please keep safe in case something fails): ${'testing master account'}`,
    EventStatus.Waiting,
  );
  return { token, sep10Account };
};

export async function sep24First(
  sessionParams: IAnchorSessionParams,
  sep10Account: string,
  outputToken: OutputTokenType,
  address: `0x${string}` | undefined,
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
      asset_code: sessionParams.tokenConfig.stellarAsset.code.stringStellar,
      amount: sessionParams.offrampAmount,
      account: sep10Account, // THIS is a particularity of Anclap. Should be able to work just with the epmhemeral account
      // or at least the anchor should be able to get it from the JWT.
      // Since we signed with the master/omnibus from the service, we need to specify the corresponding public here
      // memo: deriveMemoFromAddress(address!),
      // memo_type: 'id',
    });
  } else {
    sep24Params = new URLSearchParams({
      asset_code: sessionParams.tokenConfig.stellarAsset.code.stringStellar,
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
