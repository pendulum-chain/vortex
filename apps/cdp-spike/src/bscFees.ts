export function getBscEip1559Fees(gasPrice: bigint): {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
} {
  return {
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice
  };
}
