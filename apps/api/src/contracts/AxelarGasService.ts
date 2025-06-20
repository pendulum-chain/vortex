export const axelarGasServiceAbi = [
  {
    inputs: [{ internalType: "address", name: "gasCollector_", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      { internalType: "uint256", name: "required", type: "uint256" },
      { internalType: "uint256", name: "provided", type: "uint256" }
    ],
    name: "InsufficientGasPayment",
    type: "error"
  },
  { inputs: [], name: "InvalidAddress", type: "error" },
  { inputs: [], name: "InvalidAmounts", type: "error" },
  { inputs: [], name: "InvalidCodeHash", type: "error" },
  { inputs: [], name: "InvalidGasUpdates", type: "error" },
  { inputs: [], name: "InvalidImplementation", type: "error" },
  { inputs: [], name: "InvalidOwner", type: "error" },
  { inputs: [], name: "InvalidOwnerAddress", type: "error" },
  { inputs: [], name: "InvalidParams", type: "error" },
  { inputs: [], name: "NativeTransferFailed", type: "error" },
  { inputs: [], name: "NotCollector", type: "error" },
  { inputs: [], name: "NotOwner", type: "error" },
  { inputs: [], name: "NotProxy", type: "error" },
  { inputs: [], name: "SetupFailed", type: "error" },
  { inputs: [], name: "TokenTransferFailed", type: "error" },
  {
    inputs: [{ internalType: "enum GasEstimationType", name: "gasEstimationType", type: "uint8" }],
    name: "UnsupportedEstimationType",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "logIndex", type: "uint256" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "ExpressGasAdded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "logIndex", type: "uint256" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "GasAdded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "string", name: "chain", type: "string" },
      {
        components: [
          { internalType: "uint64", name: "gasEstimationType", type: "uint64" },
          { internalType: "uint64", name: "l1FeeScalar", type: "uint64" },
          { internalType: "uint128", name: "axelarBaseFee", type: "uint128" },
          { internalType: "uint128", name: "relativeGasPrice", type: "uint128" },
          { internalType: "uint128", name: "relativeBlobBaseFee", type: "uint128" },
          { internalType: "uint128", name: "expressFee", type: "uint128" }
        ],
        indexed: false,
        internalType: "struct GasInfo",
        name: "info",
        type: "tuple"
      }
    ],
    name: "GasInfoUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "GasPaidForContractCall",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "GasPaidForContractCallWithToken",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "GasPaidForExpressCall",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "GasPaidForExpressCallWithToken",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "logIndex", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "NativeExpressGasAdded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "logIndex", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "NativeGasAdded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "NativeGasPaidForContractCall",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "NativeGasPaidForContractCallWithToken",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "NativeGasPaidForExpressCall",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sourceAddress", type: "address" },
      { indexed: false, internalType: "string", name: "destinationChain", type: "string" },
      { indexed: false, internalType: "string", name: "destinationAddress", type: "string" },
      { indexed: true, internalType: "bytes32", name: "payloadHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { indexed: false, internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "NativeGasPaidForExpressCallWithToken",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "address", name: "newOwner", type: "address" }],
    name: "OwnershipTransferStarted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "address", name: "newOwner", type: "address" }],
    name: "OwnershipTransferred",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "logIndex", type: "uint256" },
      { indexed: false, internalType: "address payable", name: "receiver", type: "address" },
      { indexed: false, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "Refunded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "address", name: "newImplementation", type: "address" }],
    name: "Upgraded",
    type: "event"
  },
  { inputs: [], name: "acceptOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { internalType: "bytes32", name: "txHash", type: "bytes32" },
      { internalType: "uint256", name: "logIndex", type: "uint256" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "addExpressGas",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "txHash", type: "bytes32" },
      { internalType: "uint256", name: "logIndex", type: "uint256" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "addGas",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "txHash", type: "bytes32" },
      { internalType: "uint256", name: "logIndex", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "addNativeExpressGas",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "txHash", type: "bytes32" },
      { internalType: "uint256", name: "logIndex", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "addNativeGas",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address payable", name: "receiver", type: "address" },
      { internalType: "address[]", name: "tokens", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" }
    ],
    name: "collectFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "contractId",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "pure",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "uint256", name: "executionGasLimit", type: "uint256" },
      { internalType: "bytes", name: "", type: "bytes" }
    ],
    name: "estimateGasFee",
    outputs: [{ internalType: "uint256", name: "gasEstimate", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "gasCollector",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "chain", type: "string" }],
    name: "getGasInfo",
    outputs: [
      {
        components: [
          { internalType: "uint64", name: "gasEstimationType", type: "uint64" },
          { internalType: "uint64", name: "l1FeeScalar", type: "uint64" },
          { internalType: "uint128", name: "axelarBaseFee", type: "uint128" },
          { internalType: "uint128", name: "relativeGasPrice", type: "uint128" },
          { internalType: "uint128", name: "relativeBlobBaseFee", type: "uint128" },
          { internalType: "uint128", name: "expressFee", type: "uint128" }
        ],
        internalType: "struct GasInfo",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "implementation",
    outputs: [{ internalType: "address", name: "implementation_", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "owner_", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "uint256", name: "executionGasLimit", type: "uint256" },
      { internalType: "bool", name: "estimateOnChain", type: "bool" },
      { internalType: "address", name: "refundAddress", type: "address" },
      { internalType: "bytes", name: "params", type: "bytes" }
    ],
    name: "payGas",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payGasForContractCall",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payGasForContractCallWithToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payGasForExpressCall",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "uint256", name: "gasFeeAmount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payGasForExpressCallWithToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payNativeGasForContractCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payNativeGasForContractCallWithToken",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payNativeGasForExpressCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "string", name: "destinationChain", type: "string" },
      { internalType: "string", name: "destinationAddress", type: "string" },
      { internalType: "bytes", name: "payload", type: "bytes" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "refundAddress", type: "address" }
    ],
    name: "payNativeGasForExpressCallWithToken",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "pendingOwner",
    outputs: [{ internalType: "address", name: "owner_", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "proposeOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "txHash", type: "bytes32" },
      { internalType: "uint256", name: "logIndex", type: "uint256" },
      { internalType: "address payable", name: "receiver", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "refund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address payable", name: "receiver", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "refund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "bytes", name: "data", type: "bytes" }],
    name: "setup",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string[]", name: "chains", type: "string[]" },
      {
        components: [
          { internalType: "uint64", name: "gasEstimationType", type: "uint64" },
          { internalType: "uint64", name: "l1FeeScalar", type: "uint64" },
          { internalType: "uint128", name: "axelarBaseFee", type: "uint128" },
          { internalType: "uint128", name: "relativeGasPrice", type: "uint128" },
          { internalType: "uint128", name: "relativeBlobBaseFee", type: "uint128" },
          { internalType: "uint128", name: "expressFee", type: "uint128" }
        ],
        internalType: "struct GasInfo[]",
        name: "gasUpdates",
        type: "tuple[]"
      }
    ],
    name: "updateGasInfo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "newImplementation", type: "address" },
      { internalType: "bytes32", name: "newImplementationCodeHash", type: "bytes32" },
      { internalType: "bytes", name: "params", type: "bytes" }
    ],
    name: "upgrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];
