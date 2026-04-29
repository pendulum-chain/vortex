import { CreateExecuteMessageExtrinsicOptions } from "@pendulum-chain/api-solang";
import { encodeFunctionData } from "viem/utils";
import {
  AccountMeta,
  ApiManager,
  EvmClientManager,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  Networks,
  PendulumTokenDetails
} from "../../../index";
import { NABLA_ROUTER_BASE } from "../../../tokens/constants/misc";
import { prepareNablaApproveTransaction } from "./approve";
import { prepareNablaSwapTransaction } from "./swap";

export type ExtrinsicOptions = Omit<CreateExecuteMessageExtrinsicOptions, "abi" | "api">;

export async function createNablaTransactionsForOfframp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.type !== "Substrate") {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.type}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  return {
    approve: {
      extrinsicOptions: approveTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(approveTransaction.extrinsic)
    },
    swap: {
      extrinsicOptions: swapTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(swapTransaction.extrinsic)
    }
  };
}

export async function createNablaTransactionsForOnrampOnEVM(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenAddress: `0x${string}`,
  outputTokenAddress: `0x${string}`,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.type !== "EVM") {
    throw new Error(`Can't create Nabla EVM transactions for ${ephemeral.type}`);
  }

  const evmClientManager = EvmClientManager.getInstance();
  const baseClient = evmClientManager.getClient(Networks.Base);

  const ephemeralAddress = ephemeral.address;

  // Create approve transaction for the input token
  const approveCallData = encodeFunctionData({
    abi: [
      {
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" }
        ],
        name: "approve",
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
        type: "function"
      }
    ],
    args: [NABLA_ROUTER_BASE, BigInt(amountRaw)],
    functionName: "approve"
  });

  const { maxFeePerGas: approveMaxFee, maxPriorityFeePerGas: approveMaxPriority } = await baseClient.estimateFeesPerGas();

  const approveTransaction: EvmTransactionData = {
    data: approveCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: approveMaxFee.toString(),
    maxPriorityFeePerGas: approveMaxPriority.toString(),
    to: inputTokenAddress,
    value: "0"
  };

  // Create swap transaction
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // Standard ABI for the swap function
  const swapAbi = [
    {
      inputs: [
        { name: "_amountIn", type: "uint256" },
        { name: "_amountOutMin", type: "uint256" },
        { name: "_tokenInOut", type: "address[]" },
        { name: "_to", type: "address" },
        { name: "_deadline", type: "uint256" }
      ],
      name: "swapExactTokensForTokens",
      outputs: [{ type: "uint256[]" }],
      stateMutability: "nonpayable",
      type: "function"
    }
  ];

  const swapCallData = encodeFunctionData({
    abi: swapAbi,
    args: [
      BigInt(amountRaw),
      BigInt(nablaHardMinimumOutputRaw),
      [inputTokenAddress, outputTokenAddress],
      ephemeralAddress,
      BigInt(deadline)
    ],
    functionName: "swapExactTokensForTokens"
  });

  const { maxFeePerGas: swapMaxFee, maxPriorityFeePerGas: swapMaxPriority } = await baseClient.estimateFeesPerGas();

  const swapTransaction: EvmTransactionData = {
    data: swapCallData as `0x${string}`,
    gas: "500000", // Higher gas limit for swap
    maxFeePerGas: swapMaxFee.toString(),
    maxPriorityFeePerGas: swapMaxPriority.toString(),
    to: NABLA_ROUTER_BASE,
    value: "0"
  };

  return {
    approve: approveTransaction,
    swap: swapTransaction
  };
}

export async function createNablaTransactionsForOnramp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.type !== "Substrate") {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.type}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  return {
    approve: {
      extrinsicOptions: approveTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(approveTransaction.extrinsic)
    },
    swap: {
      extrinsicOptions: swapTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(swapTransaction.extrinsic)
    }
  };
}
