import { Keyring } from "@polkadot/api";
import { mnemonicGenerate } from "@polkadot/util-crypto";
import { Keypair } from "stellar-sdk";

export interface EphemeralAccount {
  secret: string;
  address: string;
}

export function createMoonbeamEphemeral(): EphemeralAccount {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: "ethereum" });

  const ephemeralAccountKeypair = keyring.addFromUri(`${seedPhrase}/m/44'/60'/${0}'/${0}/${0}`);

  return {
    address: ephemeralAccountKeypair.address,
    secret: seedPhrase
  };
}

export function createPendulumEphemeral(): EphemeralAccount {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: "sr25519" });
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { address, secret: ephemeralKeys.secret() };
}
