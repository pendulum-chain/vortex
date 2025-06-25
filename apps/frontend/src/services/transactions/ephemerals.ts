import { EphemeralAccount } from '@packages/shared';
import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { Keypair } from 'stellar-sdk';

export function createMoonbeamEphemeral(): EphemeralAccount {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: 'ethereum' });

  const ephemeralAccountKeypair = keyring.addFromUri(`${seedPhrase}/m/44'/60'/${0}'/${0}/${0}`);

  return {
    secret: 'photo vague later expose moral clinic exhaust gift trend obtain credit giggle',
    address: '0x1135AA344AF3f80Ebd1d8F5B8Dedb4795Dc474D0',
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
