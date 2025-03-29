import { Keypair, TransactionBuilder, Networks, Transaction } from 'stellar-sdk';
import { TOKEN_CONFIG } from 'shared';
import { SEP10_MASTER_SECRET, CLIENT_DOMAIN_SECRET } from '../../../constants/constants';
import { fetchTomlValues } from '../../helpers/anchors';
import { getOutToken, validateTransaction, validateFirstOperation, validateRemainingOperations } from './helpers';

const NETWORK_PASSPHRASE = Networks.PUBLIC;

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
  outToken: keyof typeof TOKEN_CONFIG,
  clientPublicKey: string,
  memo: string | null,
): Promise<Sep10Response> => {
  if (!SEP10_MASTER_SECRET || !CLIENT_DOMAIN_SECRET) {
    throw new Error('Missing required secrets');
  }
  const masterStellarKeypair = Keypair.fromSecret(SEP10_MASTER_SECRET);
  const clientDomainStellarKeypair = Keypair.fromSecret(CLIENT_DOMAIN_SECRET);

  const outTokenConfig = getOutToken(outToken);
  const { signingKey: anchorSigningKey } = (await fetchTomlValues(outTokenConfig.tomlFileUrl)) as TomlValues;
  const { homeDomain, clientDomainEnabled, memoEnabled } = outTokenConfig;
  const transactionSigned = TransactionBuilder.fromXDR(challengeXDR, NETWORK_PASSPHRASE);

  if (!(transactionSigned instanceof Transaction)) {
    throw new Error('Expected a Transaction, got a FeeBumpTransaction');
  }

  validateTransaction(transactionSigned, anchorSigningKey, memo);

  const { operations } = transactionSigned;
  validateFirstOperation(
    operations[0],
    clientPublicKey,
    homeDomain,
    memo,
    memoEnabled,
    masterStellarKeypair.publicKey(),
  );

  validateRemainingOperations(
    operations,
    anchorSigningKey,
    clientDomainStellarKeypair.publicKey(),
    clientDomainEnabled,
  );

  const clientDomainSignature = clientDomainEnabled
    ? transactionSigned.getKeypairSignature(clientDomainStellarKeypair)
    : undefined;

  const masterClientSignature =
    memo !== null && memoEnabled ? transactionSigned.getKeypairSignature(masterStellarKeypair) : undefined;

  return {
    clientSignature: clientDomainSignature,
    clientPublic: clientDomainStellarKeypair.publicKey(),
    masterClientSignature,
    masterClientPublic: masterStellarKeypair.publicKey(),
  };
};
