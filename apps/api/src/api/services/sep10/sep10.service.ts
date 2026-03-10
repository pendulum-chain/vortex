import { FiatToken, TOKEN_CONFIG } from "@vortexfi/shared";
import { Keypair, Networks, Transaction, TransactionBuilder } from "stellar-sdk";
import { CLIENT_DOMAIN_SECRET, SANDBOX_ENABLED, SEP10_MASTER_SECRET } from "../../../constants/constants";
import { fetchTomlValues } from "../../helpers/anchors";
import { getOutToken, validateFirstOperation, validateRemainingOperations, validateTransaction } from "./helpers";

const NETWORK_PASSPHRASE = SANDBOX_ENABLED ? Networks.TESTNET : Networks.PUBLIC;

interface TomlValues {
  signingKey: string;
}

interface Sep10Response {
  clientSignature?: string;
  clientPublic: string;
  masterClientSignature?: string;
  masterClientPublic: string;
}

export const signSep10Challenge = async (
  challengeXDR: string,
  fiatToken: FiatToken,
  clientPublicKey: string,
  memo: string | null
): Promise<Sep10Response> => {
  if (!SEP10_MASTER_SECRET || !CLIENT_DOMAIN_SECRET) {
    throw new Error("Missing required secrets");
  }
  const masterStellarKeypair = Keypair.fromSecret(SEP10_MASTER_SECRET);
  const clientDomainStellarKeypair = Keypair.fromSecret(CLIENT_DOMAIN_SECRET);

  // Map FiatToken enum values to TOKEN_CONFIG keys
  const tokenMapping: Record<FiatToken, keyof typeof TOKEN_CONFIG> = {
    [FiatToken.EURC]: "EURC",
    [FiatToken.ARS]: "ARS",
    [FiatToken.BRL]: "BRL",
    [FiatToken.USD]: "USDC", // USD maps to USDC for consistency, though not used for SEP10
    [FiatToken.MXN]: "MXN", // not used for SEP10
    [FiatToken.COP]: "COP" // not used for SEP10
  };

  const outToken = tokenMapping[fiatToken];

  const outTokenConfig = getOutToken(outToken);
  const { signingKey: anchorSigningKey } = (await fetchTomlValues(outTokenConfig.tomlFileUrl)) as TomlValues;
  const { homeDomain, clientDomainEnabled, memoEnabled } = outTokenConfig;
  const transactionSigned = TransactionBuilder.fromXDR(challengeXDR, NETWORK_PASSPHRASE);

  if (!(transactionSigned instanceof Transaction)) {
    throw new Error("Expected a Transaction, got a FeeBumpTransaction");
  }

  validateTransaction(transactionSigned, anchorSigningKey, memo);

  const { operations } = transactionSigned;
  validateFirstOperation(operations[0], clientPublicKey, homeDomain, memo, memoEnabled, masterStellarKeypair.publicKey());

  validateRemainingOperations(operations, anchorSigningKey, clientDomainStellarKeypair.publicKey(), clientDomainEnabled);

  const clientDomainSignature = clientDomainEnabled
    ? transactionSigned.getKeypairSignature(clientDomainStellarKeypair)
    : undefined;

  const masterClientSignature =
    memo !== null && memoEnabled ? transactionSigned.getKeypairSignature(masterStellarKeypair) : undefined;

  return {
    clientPublic: clientDomainStellarKeypair.publicKey(),
    clientSignature: clientDomainSignature,
    masterClientPublic: masterStellarKeypair.publicKey(),
    masterClientSignature
  };
};
