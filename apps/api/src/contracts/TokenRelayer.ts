export const tokenRelayerAbi = [
  {
    inputs: [
      {
        components: [
          { name: "token", type: "address" },
          { name: "owner", type: "address" },
          { name: "value", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "permitV", type: "uint8" },
          { name: "permitR", type: "bytes32" },
          { name: "permitS", type: "bytes32" },
          { name: "payloadData", type: "bytes" },
          { name: "payloadValue", type: "uint256" },
          { name: "payloadNonce", type: "uint256" },
          { name: "payloadDeadline", type: "uint256" },
          { name: "payloadV", type: "uint8" },
          { name: "payloadR", type: "bytes32" },
          { name: "payloadS", type: "bytes32" }
        ],
        name: "params",
        type: "tuple"
      }
    ],
    name: "execute",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "payable",
    type: "function"
  }
];
