import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, hdEthereum, mnemonicGenerate } from "@polkadot/util-crypto";
import { mnemonicToSeedSync } from "@scure/bip39";
import { Keypair } from "stellar-sdk";
import { EphemeralAccount } from "../index";

export function deriveEvmPrivateKeyFromMnemonic(mnemonic: string): Uint8Array {
  const ethDerPath = `m/44'/60'/${0}'/${0}/${0}`;
  return hdEthereum(mnemonicToSeedSync(mnemonic, ""), ethDerPath).secretKey;
}

export function createMoonbeamEphemeral(): EphemeralAccount {
  const seedPhrase = mnemonicGenerate();
  const keyring = new Keyring({ type: "ethereum" });

  const privateKey = deriveEvmPrivateKeyFromMnemonic(seedPhrase);
  const ephemeralAccountKeypair = keyring.addFromSeed(privateKey);

  return {
    address: ephemeralAccountKeypair.address,
    secret: u8aToHex(privateKey)
  };
}

export async function createPendulumEphemeral(): Promise<EphemeralAccount> {
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: "sr25519" });
  await cryptoWaitReady();
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}

export function createStellarEphemeral(): EphemeralAccount {
  const ephemeralKeys = Keypair.random();
  const address = ephemeralKeys.publicKey();

  return { address, secret: ephemeralKeys.secret() };
}
