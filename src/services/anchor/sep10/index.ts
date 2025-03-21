import { Transaction, Keypair, Memo, Operation, MemoType } from 'stellar-sdk';

import { getTokenDetailsSpacewalk } from '../../../constants/tokenConfig';
import { FiatToken } from '../../../constants/tokenConfig';
import { TomlValues } from '../../../types/sep';

import { exists, getUrlParams, sep10SignaturesWithLoginRefresh } from './utils';
import { fetchAndValidateChallenge } from './challenge';

interface Sep10Response {
  token: string;
  sep10Account: string;
}

interface Sep10JwtResponse {
  token: string;
}

async function submitSignedTransaction(
  webAuthEndpoint: string,
  transaction: Transaction<Memo<MemoType>, Operation[]>,
): Promise<string> {
  const jwt = await fetch(webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: transaction.toXDR().toString() }),
  });

  if (jwt.status !== 200) {
    throw new Error(`Failed to submit SEP-10 response: ${jwt.statusText}`);
  }

  const { token } = (await jwt.json()) as Sep10JwtResponse;
  return token;
}

export async function sep10(
  tomlValues: TomlValues,
  stellarEphemeralSecret: string,
  outputToken: FiatToken,
  address: string,
  checkAndWaitForSignature: () => Promise<void>,
  forceRefreshAndWaitForSignature: () => Promise<void>,
): Promise<Sep10Response> {
  const { signingKey, webAuthEndpoint } = tomlValues;

  if (!exists(signingKey) || !exists(webAuthEndpoint)) {
    throw new Error('sep10: Missing values in TOML file');
  }

  const ephemeralKeys = Keypair.fromSecret(stellarEphemeralSecret);
  const accountId = ephemeralKeys.publicKey();
  const { usesMemo, supportsClientDomain } = getTokenDetailsSpacewalk(outputToken);

  const { urlParams, sep10Account } = await getUrlParams(accountId, usesMemo, supportsClientDomain, address);
  const transactionSigned = await fetchAndValidateChallenge(webAuthEndpoint, urlParams, signingKey);

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

  const token = await submitSignedTransaction(webAuthEndpoint, transactionSigned);
  return { token, sep10Account };
}
