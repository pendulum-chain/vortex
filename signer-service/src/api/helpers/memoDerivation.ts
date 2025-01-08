import { keccak256 } from 'viem/utils';
import { Keyring } from '@polkadot/api';

type Address = `0x${string}` | string;
type HashValue = `0x${string}` | Uint8Array;

/**
 * Returns the hash value for the address.
 * For Ethereum addresses, returns the address itself.
 * For Polkadot addresses, returns the raw bytes of the decoded address.
 */
function getHashValueForAddress(address: Address): HashValue {
  if (address.startsWith('0x')) {
    return address as `0x${string}`;
  }

  const keyring = new Keyring({ type: 'sr25519' });
  return keyring.decodeAddress(address);
}

/**
 * Derives a 15-digit memo from an address by:
 * 1. Getting a hash value for the address
 * 2. Computing keccak256 hash
 * 3. Converting to decimal string and taking first 15 digits
 */
export async function deriveMemoFromAddress(address: Address): Promise<string> {
  const hashValue = getHashValueForAddress(address);
  const hash = keccak256(hashValue);
  return BigInt(hash).toString().slice(0, 15);
}
