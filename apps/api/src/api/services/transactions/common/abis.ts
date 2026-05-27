export const transferAbi = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;
