import { EvmClientManager, EvmTransactionData } from "@packages/shared";
import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  createMoonbeamToPendulumXCM,
  createNablaTransactionsForOnramp,
  EvmNetworks,
  encodeSubmittableExtrinsic,
  getNetworkId,
  Networks,
  PendulumTokenDetails,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData } from "viem/utils";
import erc20ABI from "../../../../../contracts/ERC20";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { StateMetadata } from "../../../phases/meta-state-types";
import { prepareMoonbeamCleanupTransaction } from "../../moonbeam/cleanup";
import { preparePendulumCleanupTransaction } from "../../pendulum/cleanup";

/**
 * Creates Moonbeam to Pendulum XCM transactions
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
export async function addMoonbeamTransactions(
  params: {
    pendulumEphemeralAddress: string;
    inputAmountRaw: string;
    fromToken: `0x${string}`;
    account: AccountMeta;
    toNetworkId: number;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  const { pendulumEphemeralAddress, inputAmountRaw, fromToken, account, toNetworkId } = params;

  // Create and add Moonbeam to Pendulum XCM transaction
  const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
    pendulumEphemeralAddress,
    inputAmountRaw,
    fromToken
  );

  unsignedTxs.push({
    meta: {},
    network: Networks.Moonbeam,
    nonce: nextNonce,
    phase: "moonbeamToPendulumXcm",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction)
  });
  // For some reason, the Moonbeam to Pendulum XCM transaction causes a nonce increment of 2.
  nextNonce = nextNonce + 2;

  // Create and add Moonbeam cleanup transaction
  const moonbeamCleanupTransaction = await prepareMoonbeamCleanupTransaction();

  // For assethub, we skip the 2 squidRouter transactions, so nonce is 2 lower.
  // TODO is the moonbeamCleanup nonce too high?
  const moonbeamCleanupNonce =
    toNetworkId === getNetworkId(Networks.AssetHub)
      ? nextNonce // no nonce increase we skip squidRouter transactions
      : nextNonce + 2; // +2 because we need to account for squidRouter approve and swap

  unsignedTxs.push({
    meta: {},
    network: Networks.Moonbeam,
    nonce: moonbeamCleanupNonce,
    phase: "moonbeamCleanup",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(moonbeamCleanupTransaction)
  });

  return nextNonce;
}

/**
 * Creates Nabla swap transactions for Pendulum
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function addNablaSwapTransactions(
  params: {
    quote: QuoteTicketAttributes;
    account: AccountMeta;
    inputTokenPendulumDetails: PendulumTokenDetails;
    outputTokenPendulumDetails: PendulumTokenDetails;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { quote, account, inputTokenPendulumDetails, outputTokenPendulumDetails } = params;

  if (!quote.metadata.nablaSwap?.inputAmountForSwapRaw) {
    throw new Error("Missing nablaSwap input amount in quote metadata");
  }

  // The input amount for the swap was already calculated in the quote.
  const inputAmountForNablaSwapRaw = quote.metadata.nablaSwap.inputAmountForSwapRaw;
  const outputAmountRaw = Big(quote.metadata.nablaSwap.outputAmountRaw);

  const nablaSoftMinimumOutputRaw = outputAmountRaw.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN).toFixed(0, 0);
  const nablaHardMinimumOutputRaw = outputAmountRaw.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN).toFixed(0, 0);

  const { approve, swap } = await createNablaTransactionsForOnramp(
    inputAmountForNablaSwapRaw,
    account,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw
  );

  // Add Nabla approve transaction
  unsignedTxs.push({
    meta: {},
    network: Networks.Pendulum,
    nonce: nextNonce,
    phase: "nablaApprove",
    signer: account.address,
    txData: approve.transaction
  });
  nextNonce++;

  // Add Nabla swap transaction
  unsignedTxs.push({
    meta: {},
    network: Networks.Pendulum,
    nonce: nextNonce,
    phase: "nablaSwap",
    signer: account.address,
    txData: swap.transaction
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      nabla: {
        approveExtrinsicOptions: approve.extrinsicOptions,
        swapExtrinsicOptions: swap.extrinsicOptions
      },
      nablaSoftMinimumOutputRaw
    }
  };
}

/**
 * Creates Pendulum cleanup transaction
 * @param params Transaction parameters
 * @returns Cleanup transaction template
 */
export async function addPendulumCleanupTx(params: {
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
  account: AccountMeta;
}): Promise<Omit<UnsignedTx, "nonce">> {
  const { inputTokenPendulumDetails, outputTokenPendulumDetails, account } = params;

  const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
    inputTokenPendulumDetails.currencyId,
    outputTokenPendulumDetails.currencyId
  );

  return {
    meta: {},
    network: Networks.Pendulum,
    phase: "pendulumCleanup",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction)
  };
}

/**
 * Creates transactions to handle the ephemeral account on the destination chain
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
export async function addOnrampDestinationChainTransactions(params: {
  toAddress: string;
  toToken: `0x${string}`;
  amountRaw: string;
  destinationNetwork: EvmNetworks;
}): Promise<EvmTransactionData> {
  const { toAddress, amountRaw, destinationNetwork, toToken } = params;

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(destinationNetwork);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [toAddress, amountRaw],
    functionName: "transfer"
  });

  const { maxFeePerGas } = await publicClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: toToken,
    value: "0"
  };

  return txData;
}

/**
 * Creates an approval transaction on the destination chain
 * @param params Transaction parameters
 * @returns EvmTransactionData
 */
export async function addDestinationChainApprovalTransaction(params: {
  amountRaw: string;
  spenderAddress: string;
  tokenAddress: `0x${string}`;
  destinationNetwork: EvmNetworks;
}): Promise<EvmTransactionData> {
  const { amountRaw, spenderAddress, tokenAddress, destinationNetwork } = params;

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(destinationNetwork);

  const approveCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [spenderAddress, amountRaw],
    functionName: "approve"
  });

  const { maxFeePerGas } = await publicClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: approveCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: tokenAddress,
    value: "0"
  };

  return txData;
}
