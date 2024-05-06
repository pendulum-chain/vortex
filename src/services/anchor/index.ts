import { Transaction, Keypair, Networks } from 'stellar-sdk';
import { EventStatus } from '../../components/GenericEvent';
import { TokenDetails } from '../../constants/tokenConfig';
export interface TomlValues {
  signingKey?: string;
  webAuthEndpoint?: string;
  sep24Url?: string;
}

export interface ISep24Intermediate {
  url: string;
  id: string;
}

export interface IAnchorSessionParams {
  token: string;
  tomlValues: TomlValues;
  tokenConfig: TokenDetails;
}

export interface Sep24Result {
  amount: string;
  memo: string;
  memoType: string;
  offrampingAccount: string;
}

const exists = (value?: string | null): value is string => !!value && value?.length > 0;
let ephemeralKeys: Keypair | null;

export const getEphemeralKeys = () => {
  if (ephemeralKeys) {
    return ephemeralKeys;
  } else {
    ephemeralKeys = Keypair.random();
    return ephemeralKeys;
  }
};

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
  };
};

export const sep10 = async (
  tomlValues: TomlValues,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<string> => {
  const { signingKey, webAuthEndpoint } = tomlValues;

  if (!exists(signingKey) || !exists(webAuthEndpoint)) {
    throw new Error('Missing values in TOML file');
  }
  const NETWORK_PASSPHRASE = Networks.PUBLIC;
  const ephemeralKeys = getEphemeralKeys();
  const accountId = ephemeralKeys.publicKey();
  const urlParams = new URLSearchParams({
    account: accountId,
  });

  console.log('Initiate SEP-10');
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
  console.log(`SEP-10 challenge completed.`);

  // print the ephemeral secret, for testing
  renderEvent(`Ephemeral secret: ${ephemeralKeys.secret()}`, EventStatus.Waiting);
  return token;
};

export async function sep24First(
  sessionParams: IAnchorSessionParams,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<ISep24Intermediate> {
  console.log('Initiate SEP-24');
  const { token, tomlValues } = sessionParams;
  const { sep24Url } = tomlValues;
  const sep24Params = new URLSearchParams({
    asset_code: sessionParams.tokenConfig.assetCode,
  });

  const fetchUrl = `${sep24Url}/transactions/withdraw/interactive`;
  const sep24Response = await fetch(fetchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
    body: sep24Params.toString(),
  });
  if (sep24Response.status !== 200) {
    renderEvent(`Failed to initiate SEP-24: ${sep24Response.statusText}, ${fetchUrl}`, EventStatus.Error);
    throw new Error(`Failed to initiate SEP-24: ${sep24Response.statusText}`);
  }

  const { type, url, id } = await sep24Response.json();
  if (type !== 'interactive_customer_info_needed') {
    renderEvent(`Unexpected SEP-24 type: ${type}`, EventStatus.Error);
    throw new Error(`Unexpected SEP-24 type: ${type}`);
  }

  console.log(`SEP-24 initiated. Please complete the form at ${url}.`);

  return { url, id };
}

export async function sep24Second(
  sep24Values: ISep24Intermediate,
  sessionParams: IAnchorSessionParams,
  renderEvent: (event: string, status: EventStatus) => void,
): Promise<Sep24Result> {
  const { id } = sep24Values;
  const { token, tomlValues } = sessionParams;
  const { sep24Url } = tomlValues;

  // Mock, testing
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  // return {
  //   amount: "10.3",
  //   memo: "todo",
  //   memoType: "text",
  //   offrampingAccount: "GADBL6LKYBPNGXBKNONXTFVIRMQIXHH2ZW67SVA2R7XM6VBXMD2O6DIS",
  // };
  // end mock testing

  let status;
  let transaction: any;
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
    console.log(transaction);
    status = transaction;
  } while (status.status !== 'pending_user_transfer_start');

  console.log('SEP-24 parameters received');
  return {
    amount: status.amount_in,
    memo: status.withdraw_memo,
    memoType: status.withdraw_memo_type,
    offrampingAccount: status.withdraw_anchor_account,
  };
}
