import { FiatToken, getTokenDetailsSpacewalk } from "@packages/shared";
import { Keypair, Memo, MemoType, Operation, Transaction } from "stellar-sdk";
import { TomlValues } from "../../../types/sep";

import { fetchAndValidateChallenge } from "./challenge";
import { exists, fetchSep10Signatures, getUrlParams } from "./utils";

interface Sep10Response {
  token: string;
  sep10Account: string;
}

interface Sep10JwtResponse {
  token: string;
}

async function submitSignedTransaction(
  webAuthEndpoint: string,
  transaction: Transaction<Memo<MemoType>, Operation[]>
): Promise<string> {
  const jwt = await fetch(webAuthEndpoint, {
    body: JSON.stringify({ transaction: transaction.toXDR().toString() }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
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
  address: string
): Promise<Sep10Response> {
  const { signingKey, webAuthEndpoint } = tomlValues;

  if (!exists(signingKey) || !exists(webAuthEndpoint)) {
    throw new Error("sep10: Missing values in TOML file");
  }

  const ephemeralKeys = Keypair.fromSecret(stellarEphemeralSecret);
  const accountId = ephemeralKeys.publicKey();
  const { usesMemo, supportsClientDomain } = getTokenDetailsSpacewalk(outputToken);

  const { urlParams, sep10Account } = await getUrlParams(accountId, usesMemo, supportsClientDomain, address);
  const transactionSigned = await fetchAndValidateChallenge(webAuthEndpoint, urlParams, signingKey);

  const { masterClientSignature, clientSignature, clientPublic } = await fetchSep10Signatures({
    address: address,
    challengeXDR: transactionSigned.toXDR(),
    clientPublicKey: sep10Account,
    outToken: outputToken,
    usesMemo
  });

  if (supportsClientDomain) {
    transactionSigned.addSignature(clientPublic, clientSignature);
  }

  if (!usesMemo) {
    transactionSigned.sign(ephemeralKeys);
  } else {
    transactionSigned.addSignature(sep10Account, masterClientSignature);
  }

  const token = await submitSignedTransaction(webAuthEndpoint, transactionSigned);
  return { sep10Account, token };
}
