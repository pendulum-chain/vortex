import { encodePacked, sha256 } from 'viem';

export function createRandomString(byteLength: number): `0x${string}` {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);

  return Array.from(array).reduce<`0x${string}`>(
    (string, byte) => `${string}${byte.toString(16).padStart(2, '0')}`,
    '0x',
  );
}

export function createSquidRouterHash(id: `0x${string}`, payload: `0x${string}`): `0x${string}` {
  const packedEncoding = encodePacked(['bytes32', 'bytes'], [id, payload]);

  return sha256(packedEncoding);
}
