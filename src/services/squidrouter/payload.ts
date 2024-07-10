import { eth } from 'web3';

function encodePayload(address: string): string {
  // Encode the payload
  // Asset should match the one received on Moonbeam side. Right now this is not used
  // on the contract so it can be anything.

  const asset = [0, ['0x0424', '0x8d0BBbA567Ae73a06A8678e53Dc7ADD0AF6b7039']];
  const destination = [1, ['0x000000082E', '0x01' + address.slice(2) + '00']];

  // Encode the data
  const payload = eth.abi.encodeParameters(
    [
      {
        type: 'tuple',
        components: [
          { type: 'uint8', name: 'parents' },
          { type: 'bytes[]', name: 'interior' },
        ],
        name: 'asset',
      },
      {
        type: 'tuple',
        components: [
          { type: 'uint8', name: 'parents' },
          { type: 'bytes[]', name: 'interior' },
        ],
        name: 'destination',
      },
      { type: 'uint256', name: 'weight' },
    ],
    [asset, destination, 1000000000000000],
  );

  return payload;
}

export default encodePayload;
