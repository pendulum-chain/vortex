import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { Keypair } from 'stellar-sdk';
import { EphemeralAccount } from 'shared';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export function createMoonbeamEphemeral(): EphemeralAccount {
  const privateKey = generatePrivateKey();

  const account = privateKeyToAccount(privateKey);

  return {
    secret: privateKey,
    address: account.address
  };
}

export function createPendulumEphemeral(): EphemeralAccount {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: 'sr25519' });
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { secret: seedPhrase, address: ephemeralAccountKeypair.address };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { secret: ephemeralKeys.secret(), address };
}

