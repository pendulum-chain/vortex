export const routerAbi = {
  contract: {
    authors: ['unknown'],
    name: 'Router',
    version: '0.0.1',
  },
  source: {
    compiler: 'solang 0.3.2',
    hash: '0x1461e0f01fe866142df918dc0c65f8a185e5079d6a642da2b79436f6839db44e',
    language: 'Solidity 0.3.2',
  },
  spec: {
    constructors: [
      {
        args: [],
        default: false,
        docs: [''],
        label: 'new',
        payable: false,
        returnType: null,
        selector: '0x861731d5',
      },
    ],
    docs: [''],
    environment: {
      accountId: {
        displayName: ['AccountId'],
        type: 2,
      },
      balance: {
        displayName: ['Balance'],
        type: 8,
      },
      blockNumber: {
        displayName: ['BlockNumber'],
        type: 9,
      },
      chainExtension: {
        displayName: [],
        type: 0,
      },
      hash: {
        displayName: ['Hash'],
        type: 10,
      },
      maxEventTopics: 4,
      timestamp: {
        displayName: ['Timestamp'],
        type: 9,
      },
    },
    events: [
      {
        args: [
          {
            docs: [],
            indexed: false,
            label: 'account',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        docs: [''],
        label: 'Paused',
      },
      {
        args: [
          {
            docs: [],
            indexed: false,
            label: 'account',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        docs: [''],
        label: 'Unpaused',
      },
      {
        args: [
          {
            docs: [],
            indexed: true,
            label: 'previousOwner',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: true,
            label: 'newOwner',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        docs: [''],
        label: 'OwnershipTransferred',
      },
      {
        args: [
          {
            docs: [],
            indexed: true,
            label: 'sender',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'pool',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        docs: ['Emitted when a new pool is registered'],
        label: 'SwapPoolRegistered',
      },
      {
        args: [
          {
            docs: [],
            indexed: true,
            label: 'sender',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        docs: ['Emitted when pool is unregistered'],
        label: 'SwapPoolUnregistered',
      },
      {
        args: [
          {
            docs: [],
            indexed: true,
            label: 'sender',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'amountIn',
            type: {
              displayName: ['uint256'],
              type: 3,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'amountOut',
            type: {
              displayName: ['uint256'],
              type: 3,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'tokenIn',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'tokenOut',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            docs: [],
            indexed: true,
            label: 'to',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        docs: ['Emitted on each swap'],
        label: 'Swap',
      },
    ],
    lang_error: {
      displayName: ['SolidityError'],
      type: 14,
    },
    messages: [
      {
        args: [],
        default: false,
        docs: [''],
        label: 'paused',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['bool'],
          type: 4,
        },
        selector: '0x5c975abb',
      },
      {
        args: [],
        default: false,
        docs: [''],
        label: 'owner',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['ink_primitives', 'types', 'AccountId'],
          type: 2,
        },
        selector: '0x8da5cb5b',
      },
      {
        args: [],
        default: false,
        docs: [''],
        label: 'renounceOwnership',
        mutates: true,
        payable: false,
        returnType: null,
        selector: '0x715018a6',
      },
      {
        args: [
          {
            label: 'newOwner',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'transferOwnership',
        mutates: true,
        payable: false,
        returnType: null,
        selector: '0xf2fde38b',
      },
      {
        args: [
          {
            label: 'asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'poolByAsset',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['ink_primitives', 'types', 'AccountId'],
          type: 2,
        },
        selector: '0x06de94d8',
      },
      {
        args: [
          {
            label: 'asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'oracleByAsset',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['ink_primitives', 'types', 'AccountId'],
          type: 2,
        },
        selector: '0x38163032',
      },
      {
        args: [
          {
            label: '_asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            label: '_priceOracle',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        default: false,
        docs: ['Changes the pools priceOracle. Can only be set by the contract owner.'],
        label: 'setPriceOracle',
        mutates: true,
        payable: false,
        returnType: null,
        selector: '0x67a74ddc',
      },
      {
        args: [
          {
            label: '_asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            label: '_swapPool',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        default: false,
        docs: ['Registers a newly created swap pool'],
        label: 'registerPool',
        mutates: true,
        payable: false,
        returnType: {
          displayName: ['bool'],
          type: 4,
        },
        selector: '0x7286e5e5',
      },
      {
        args: [
          {
            label: '_asset',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
        ],
        default: false,
        docs: ['Unregisters a swap pool'],
        label: 'unregisterPool',
        mutates: true,
        payable: false,
        returnType: {
          displayName: ['bool'],
          type: 4,
        },
        selector: '0xada61cc3',
      },
      {
        args: [],
        default: false,
        docs: ['Disable all swaps'],
        label: 'pause',
        mutates: true,
        payable: false,
        returnType: null,
        selector: '0x8456cb59',
      },
      {
        args: [],
        default: false,
        docs: ['Resume all swaps'],
        label: 'unpause',
        mutates: true,
        payable: false,
        returnType: null,
        selector: '0x3f4ba83a',
      },
      {
        args: [
          {
            label: '_amountIn',
            type: {
              displayName: ['uint256'],
              type: 3,
            },
          },
          {
            label: '_amountOutMin',
            type: {
              displayName: ['uint256'],
              type: 3,
            },
          },
          {
            label: '_tokenInOut',
            type: {
              displayName: [],
              type: 6,
            },
          },
          {
            label: '_to',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 2,
            },
          },
          {
            label: '_deadline',
            type: {
              displayName: ['uint256'],
              type: 3,
            },
          },
        ],
        default: false,
        docs: [
          'Swap some `_fromToken` tokens for `_toToken` tokens,\nensures `_amountOutMin` and `_deadline`, sends funds to `_to` address `msg.sender` needs to grant the chef contract a sufficient allowance beforehand',
        ],
        label: 'swapExactTokensForTokens',
        mutates: true,
        payable: false,
        returnType: {
          displayName: [],
          type: 5,
        },
        selector: '0x38ed1739',
      },
      {
        args: [
          {
            label: '_amountIn',
            type: {
              displayName: ['uint256'],
              type: 3,
            },
          },
          {
            label: '_tokenInOut',
            type: {
              displayName: [],
              type: 6,
            },
          },
        ],
        default: false,
        docs: [
          'Get a quote for how many `_toToken` tokens `_amountIn` many `tokenIn`\ntokens can currently be swapped for.',
        ],
        label: 'getAmountOut',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['Router', 'getAmountOut', 'return_type'],
          type: 7,
        },
        selector: '0xb8239ebb',
      },
    ],
  },
  storage: {
    struct: {
      fields: [
        {
          layout: {
            root: {
              layout: {
                struct: {
                  fields: [
                    {
                      layout: {
                        leaf: {
                          key: '0x00000000',
                          ty: 1,
                        },
                      },
                      name: '',
                    },
                  ],
                  name: 'AccountId',
                },
              },
              root_key: '0x00000000',
            },
          },
          name: '_owner',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000001',
                  ty: 3,
                },
              },
              root_key: '0x00000001',
            },
          },
          name: '_status',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000002',
                  ty: 4,
                },
              },
              root_key: '0x00000002',
            },
          },
          name: '_paused',
        },
        {
          layout: {
            root: {
              layout: {
                struct: {
                  fields: [
                    {
                      layout: {
                        leaf: {
                          key: '0x00000003',
                          ty: 1,
                        },
                      },
                      name: '',
                    },
                  ],
                  name: 'AccountId',
                },
              },
              root_key: '0x00000003',
            },
          },
          name: 'poolByAsset',
        },
        {
          layout: {
            root: {
              layout: {
                struct: {
                  fields: [
                    {
                      layout: {
                        leaf: {
                          key: '0x00000004',
                          ty: 1,
                        },
                      },
                      name: '',
                    },
                  ],
                  name: 'AccountId',
                },
              },
              root_key: '0x00000004',
            },
          },
          name: 'oracleByAsset',
        },
      ],
      name: 'Router',
    },
  },
  types: [
    {
      id: 0,
      type: {
        def: {
          primitive: 'u8',
        },
        path: ['uint8'],
      },
    },
    {
      id: 1,
      type: {
        def: {
          array: {
            len: 32,
            type: 0,
          },
        },
      },
    },
    {
      id: 2,
      type: {
        def: {
          composite: {
            fields: [
              {
                type: 1,
              },
            ],
          },
        },
        path: ['ink_primitives', 'types', 'AccountId'],
      },
    },
    {
      id: 3,
      type: {
        def: {
          primitive: 'u256',
        },
        path: ['uint256'],
      },
    },
    {
      id: 4,
      type: {
        def: {
          primitive: 'bool',
        },
        path: ['bool'],
      },
    },
    {
      id: 5,
      type: {
        def: {
          sequence: {
            type: 3,
          },
        },
      },
    },
    {
      id: 6,
      type: {
        def: {
          sequence: {
            type: 2,
          },
        },
      },
    },
    {
      id: 7,
      type: {
        def: {
          tuple: [3, 3],
        },
        path: ['Router', 'getAmountOut', 'return_type'],
      },
    },
    {
      id: 8,
      type: {
        def: {
          primitive: 'u128',
        },
        path: ['uint128'],
      },
    },
    {
      id: 9,
      type: {
        def: {
          primitive: 'u64',
        },
        path: ['uint64'],
      },
    },
    {
      id: 10,
      type: {
        def: {
          composite: {
            fields: [
              {
                type: 1,
              },
            ],
          },
        },
        path: ['ink_primitives', 'types', 'Hash'],
      },
    },
    {
      id: 11,
      type: {
        def: {
          primitive: 'str',
        },
        path: ['string'],
      },
    },
    {
      id: 12,
      type: {
        def: {
          composite: {
            fields: [
              {
                type: 11,
              },
            ],
          },
        },
        path: ['0x08c379a0'],
      },
    },
    {
      id: 13,
      type: {
        def: {
          composite: {
            fields: [
              {
                type: 3,
              },
            ],
          },
        },
        path: ['0x4e487b71'],
      },
    },
    {
      id: 14,
      type: {
        def: {
          variant: {
            variants: [
              {
                fields: [
                  {
                    type: 12,
                  },
                ],
                index: 0,
                name: 'Error',
              },
              {
                fields: [
                  {
                    type: 13,
                  },
                ],
                index: 1,
                name: 'Panic',
              },
            ],
          },
        },
        path: ['SolidityError'],
      },
    },
  ],
  version: '4',
};
