export const squidReceiverABI = [
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: 'uint8',
            name: 'parents',
            type: 'uint8',
          },
          {
            internalType: 'bytes[]',
            name: 'interior',
            type: 'bytes[]',
          },
        ],
        indexed: false,
        internalType: 'struct Xtokens.Multilocation',
        name: '',
        type: 'tuple',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
      {
        components: [
          {
            internalType: 'uint8',
            name: 'parents',
            type: 'uint8',
          },
          {
            internalType: 'bytes[]',
            name: 'interior',
            type: 'bytes[]',
          },
        ],
        indexed: false,
        internalType: 'struct Xtokens.Multilocation',
        name: '',
        type: 'tuple',
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: '',
        type: 'uint64',
      },
    ],
    name: 'MultiassetCall',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'bytes',
        name: '',
        type: 'bytes',
      },
    ],
    name: 'MultiassetError',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'balance',
        type: 'uint256',
      },
    ],
    name: 'ReceiveBalance',
    type: 'event',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: 'payload',
        type: 'bytes',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'executeXCM',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: 'payload',
        type: 'bytes',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'executeXCMMock',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'lastTransferDetails',
    outputs: [
      {
        components: [
          {
            internalType: 'uint8',
            name: 'parents',
            type: 'uint8',
          },
          {
            internalType: 'bytes[]',
            name: 'interior',
            type: 'bytes[]',
          },
        ],
        internalType: 'struct Xtokens.Multilocation',
        name: 'destination',
        type: 'tuple',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
