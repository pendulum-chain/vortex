import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, hdEthereum, mnemonicGenerate } from "@polkadot/util-crypto";
import { mnemonicToSeedSync } from "@scure/bip39";
import { privateKeyToAccount } from "viem/accounts";
import { EphemeralAccount } from "../index";

export function deriveEvmPrivateKeyFromMnemonic(mnemonic: string): Uint8Array {
  const ethDerPath = `m/44'/60'/${0}'/${0}/${0}`;
  return hdEthereum(mnemonicToSeedSync(mnemonic, ""), ethDerPath).secretKey;
}

export function createMoonbeamEphemeral(): EphemeralAccount {
  const seedPhrase = mnemonicGenerate();
  const privateKey = deriveEvmPrivateKeyFromMnemonic(seedPhrase);
  const secret = u8aToHex(privateKey) as `0x${string}`;

  return {
    address: privateKeyToAccount(secret).address,
    secret
  };
}

export async function createPendulumEphemeral(): Promise<EphemeralAccount> {
  await cryptoWaitReady();
  const seedPhrase = mnemonicGenerate();

  const keyring = new Keyring({ type: "sr25519" });
  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  return { address: ephemeralAccountKeypair.address, secret: seedPhrase };
}
