import { Keyring } from '@polkadot/api';

export function getAddressForFormat(address: string, ss58Format: number | string) {
  if (typeof ss58Format === 'string') {
    ss58Format = parseInt(ss58Format, 10);
  }

  const keyring = new Keyring();
  const encodedAddress = keyring.encodeAddress(address, ss58Format);
  return encodedAddress;
}

export function trimAddress(address: string, trimLength = 6): string {
  const addressLength = address.length;
  return `${address.slice(0, trimLength)}...${address.slice(addressLength - trimLength, addressLength)}`;
}
