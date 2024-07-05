import { eth } from 'web3';

function encodePayload(address: string): string {
  // Encode the payload
  // Asset should match the one received on Moonbeam side. Right now this is not used
  // on the contract so it can be anything.

  //TODO hardcoding 0xe5f036aeb097013707f49b3e2a310d23a79ed075a6c7a06dc7c376a825d70f73 address to not loose the funds
  const asset = [0, ['0x0424', '0x8d0BBbA567Ae73a06A8678e53Dc7ADD0AF6b7039']];
  const destination = [
    1,
    ['0x000000082E', '0x01' + '0xe5f036aeb097013707f49b3e2a310d23a79ed075a6c7a06dc7c376a825d70f73'.slice(2) + '00'],
  ];

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
