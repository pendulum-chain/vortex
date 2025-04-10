export const erc20WrapperAbi = {
  contract: {
    authors: ['unknown'],
    name: 'ERC20Wrapper',
    version: '0.0.1',
  },
  source: {
    compiler: 'solang 0.3.2',
    hash: '0xfd052826432f969b18f912400fc92fbb97ed4122dd6fa1ee3828bfc81b93e316',
    language: 'Solidity 0.3.2',
  },
  spec: {
    constructors: [
      {
        args: [
          {
            label: 'name_',
            type: {
              displayName: ['string'],
              type: 0,
            },
          },
          {
            label: 'symbol_',
            type: {
              displayName: ['string'],
              type: 0,
            },
          },
          {
            label: 'decimals_',
            type: {
              displayName: ['uint8'],
              type: 1,
            },
          },
          {
            label: 'variant_',
            type: {
              displayName: [],
              type: 2,
            },
          },
          {
            label: 'index_',
            type: {
              displayName: [],
              type: 2,
            },
          },
          {
            label: 'code_',
            type: {
              displayName: [],
              type: 3,
            },
          },
          {
            label: 'issuer_',
            type: {
              displayName: [],
              type: 4,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'new',
        payable: false,
        returnType: null,
        selector: '0xd3b751bd',
      },
    ],
    docs: [''],
    environment: {
      accountId: {
        displayName: ['AccountId'],
        type: 6,
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
            indexed: true,
            label: 'from',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            docs: [],
            indexed: true,
            label: 'to',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'value',
            type: {
              displayName: ['uint256'],
              type: 5,
            },
          },
        ],
        docs: [''],
        label: 'Transfer',
      },
      {
        args: [
          {
            docs: [],
            indexed: true,
            label: 'owner',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            docs: [],
            indexed: true,
            label: 'spender',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            docs: [],
            indexed: false,
            label: 'value',
            type: {
              displayName: ['uint256'],
              type: 5,
            },
          },
        ],
        docs: [''],
        label: 'Approval',
      },
    ],
    lang_error: {
      displayName: ['SolidityError'],
      type: 13,
    },
    messages: [
      {
        args: [],
        default: false,
        docs: [''],
        label: 'name',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['string'],
          type: 0,
        },
        selector: '0x06fdde03',
      },
      {
        args: [],
        default: false,
        docs: [''],
        label: 'symbol',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['string'],
          type: 0,
        },
        selector: '0x95d89b41',
      },
      {
        args: [],
        default: false,
        docs: [''],
        label: 'decimals',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['uint8'],
          type: 1,
        },
        selector: '0x313ce567',
      },
      {
        args: [],
        default: false,
        docs: [''],
        label: 'totalSupply',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['uint256'],
          type: 5,
        },
        selector: '0x18160ddd',
      },
      {
        args: [
          {
            label: '_owner',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'balanceOf',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['uint256'],
          type: 5,
        },
        selector: '0x70a08231',
      },
      {
        args: [
          {
            label: '_to',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            label: '_amount',
            type: {
              displayName: ['uint256'],
              type: 5,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'transfer',
        mutates: true,
        payable: false,
        returnType: {
          displayName: ['bool'],
          type: 7,
        },
        selector: '0xa9059cbb',
      },
      {
        args: [
          {
            label: '_owner',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            label: '_spender',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'allowance',
        mutates: false,
        payable: false,
        returnType: {
          displayName: ['uint256'],
          type: 5,
        },
        selector: '0xdd62ed3e',
      },
      {
        args: [
          {
            label: '_spender',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            label: '_amount',
            type: {
              displayName: ['uint256'],
              type: 5,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'approve',
        mutates: true,
        payable: false,
        returnType: {
          displayName: ['bool'],
          type: 7,
        },
        selector: '0x095ea7b3',
      },
      {
        args: [
          {
            label: '_from',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            label: '_to',
            type: {
              displayName: ['ink_primitives', 'types', 'AccountId'],
              type: 6,
            },
          },
          {
            label: '_amount',
            type: {
              displayName: ['uint256'],
              type: 5,
            },
          },
        ],
        default: false,
        docs: [''],
        label: 'transferFrom',
        mutates: true,
        payable: false,
        returnType: {
          displayName: ['bool'],
          type: 7,
        },
        selector: '0x23b872dd',
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
                leaf: {
                  key: '0x00000000',
                  ty: 0,
                },
              },
              root_key: '0x00000000',
            },
          },
          name: '_name',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000001',
                  ty: 0,
                },
              },
              root_key: '0x00000001',
            },
          },
          name: '_symbol',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000002',
                  ty: 1,
                },
              },
              root_key: '0x00000002',
            },
          },
          name: '_decimals',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000003',
                  ty: 2,
                },
              },
              root_key: '0x00000003',
            },
          },
          name: '_variant',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000004',
                  ty: 2,
                },
              },
              root_key: '0x00000004',
            },
          },
          name: '_index',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000005',
                  ty: 3,
                },
              },
              root_key: '0x00000005',
            },
          },
          name: '_code',
        },
        {
          layout: {
            root: {
              layout: {
                leaf: {
                  key: '0x00000006',
                  ty: 4,
                },
              },
              root_key: '0x00000006',
            },
          },
          name: '_issuer',
        },
      ],
      name: 'ERC20Wrapper',
    },
  },
  types: [
    {
      id: 0,
      type: {
        def: {
          primitive: 'str',
        },
        path: ['string'],
      },
    },
    {
      id: 1,
      type: {
        def: {
          primitive: 'u8',
        },
        path: ['uint8'],
      },
    },
    {
      id: 2,
      type: {
        def: {
          array: {
            len: 1,
            type: 1,
          },
        },
      },
    },
    {
      id: 3,
      type: {
        def: {
          array: {
            len: 12,
            type: 1,
          },
        },
      },
    },
    {
      id: 4,
      type: {
        def: {
          array: {
            len: 32,
            type: 1,
          },
        },
      },
    },
    {
      id: 5,
      type: {
        def: {
          primitive: 'u256',
        },
        path: ['uint256'],
      },
    },
    {
      id: 6,
      type: {
        def: {
          composite: {
            fields: [
              {
                type: 4,
              },
            ],
          },
        },
        path: ['ink_primitives', 'types', 'AccountId'],
      },
    },
    {
      id: 7,
      type: {
        def: {
          primitive: 'bool',
        },
        path: ['bool'],
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
                type: 4,
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
          composite: {
            fields: [
              {
                type: 0,
              },
            ],
          },
        },
        path: ['0x08c379a0'],
      },
    },
    {
      id: 12,
      type: {
        def: {
          composite: {
            fields: [
              {
                type: 5,
              },
            ],
          },
        },
        path: ['0x4e487b71'],
      },
    },
    {
      id: 13,
      type: {
        def: {
          variant: {
            variants: [
              {
                fields: [
                  {
                    type: 11,
                  },
                ],
                index: 0,
                name: 'Error',
              },
              {
                fields: [
                  {
                    type: 12,
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
