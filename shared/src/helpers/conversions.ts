import { StrKey } from 'stellar-sdk';
import { Buffer } from 'buffer';
import { Keyring } from '@polkadot/api';

export function stellarHexToPublic(hexString: string) {
  return StrKey.encodeEd25519PublicKey(hexToBuffer(hexString));
}

export function hexToBuffer(hexString: string) {
  if (hexString.length % 2 !== 0) {
    throw new Error('The provided hex string has an odd length. It must have an even length.');
  }
  return Buffer.from(hexString.split('0x')[1], 'hex');
}

export function hexToString(hexString: string) {
  const asBuffer = hexToBuffer(hexString);
  return asBuffer.toString('utf8');
}



export function getAddressForFormat(address: string, ss58Format: number | string) {
  if (typeof ss58Format === 'string') {
    ss58Format = parseInt(ss58Format, 10);
  }

  const keyring = new Keyring();
  const encodedAddress = keyring.encodeAddress(address, ss58Format);
  return encodedAddress;
}
