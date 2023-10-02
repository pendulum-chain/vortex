import { Asset, Keypair, StrKey } from 'stellar-sdk';
import { Buffer } from 'buffer';

export const StellarPublicKeyPattern = /^G[A-Z0-9]{55}$/;

export const isPublicKey = (str: string) => Boolean(str.match(StellarPublicKeyPattern));
export const isMuxedAddress = (str: string) => Boolean(str.match(/^M[A-Z0-9]{68}$/));
export const isStellarAddress = (str: string) =>
  // eslint-disable-next-line no-useless-escape
  Boolean(str.match(/^[^\*> \t\n\r]+\*[^\*\.> \t\n\r]+\.[^\*> \t\n\r]+$/));

// A Stellar amount should not have more than 7 decimal places
export function isCompatibleStellarAmount(amount: string): boolean {
  return !(
    (amount.split('.')[1] && amount.split('.')[1].length > 7) ||
    (amount.split(',')[1] && amount.split(',')[1].length > 7)
  );
}

export function convertRawHexKeyToPublicKey(rawPublicKeyHex: string): Keypair {
  const ed25519PublicKey = StrKey.encodeEd25519PublicKey(Buffer.from(rawPublicKeyHex.slice(2), 'hex'));
  return Keypair.fromPublicKey(ed25519PublicKey);
}

export function convertPublicKeyToRaw(pubKey: string): string {
  const raw = StrKey.decodeEd25519PublicKey(pubKey);
  return `0x${raw.toString('hex')}`;
}

export function stringifyStellarAsset(asset: Asset): string {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
}
