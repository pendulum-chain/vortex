import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  addAdditionalTransactionsToMeta,
  createAssethubToPendulumXCM,
  createNablaTransactionsForOfframp,
  createOfframpSquidrouterTransactions,
  createPaseoToPendulumXCM,
  createPendulumToMoonbeamTransfer,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  Networks,
  PendulumTokenDetails,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData } from "viem";
import { config } from "../../../../../config/vars";
import erc20ABI from "../../../../../contracts/ERC20";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";

/**
 * Creates transactions for EVM source networks using Squidrouter or mock transactions in sandbox
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param stateMeta State metadata to update
 * @returns Updated state metadata
 */
export async function createEvmSourceTransactions(
  params: {
    userAddress: string;
    pendulumEphemeralAddress: string;
    fromNetwork: Networks;
    inputAmountRaw: string;
    fromToken: `0x${string}`;
    toToken: `0x${string}`;
  },
  unsignedTxs: UnsignedTx[]
): Promise<Partial<StateMetadata>> {
  const { userAddress, pendulumEphemeralAddress, fromNetwork, inputAmountRaw, fromToken, toToken } = params;

  const squidResult = await createOfframpSquidrouterTransactions({
    fromAddress: userAddress,
    fromNetwork,
    fromToken,
    pendulumAddressDestination: pendulumEphemeralAddress,
    rawAmount: inputAmountRaw,
    toToken
  });

  let { approveData, swapData } = squidResult;
  const { squidRouterReceiverId, squidRouterReceiverHash, squidRouterQuoteId } = squidResult;

  // Override approveData and swapData in sandbox mode
  if (config.sandboxEnabled) {
    const sandboxTransactions = createSandboxEvmTransactions(inputAmountRaw);
    approveData = sandboxTransactions.approveData;
    swapData = sandboxTransactions.swapData;
  }

  unsignedTxs.push({
    meta: {},
    network: config.sandboxEnabled ? Networks.PolygonAmoy : fromNetwork,
    nonce: 0,
    phase: "squidRouterApprove",
    signer: userAddress,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: config.sandboxEnabled ? Networks.PolygonAmoy : fromNetwork,
    nonce: 0,
    phase: "squidRouterSwap",
    signer: userAddress,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  return {
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };
}

/**
 * Creates transactions for AssetHub source networks
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param fromNetwork Source network
 */
export async function createAssetHubSourceTransactions(
  params: {
    userAddress: string;
    pendulumEphemeralAddress: string;
    inputAmountRaw: string;
  },
  unsignedTxs: UnsignedTx[],
  fromNetwork: Networks
): Promise<void> {
  const { userAddress, pendulumEphemeralAddress, inputAmountRaw } = params;

  // Create Assethub to Pendulum transaction
  const assethubToPendulumTransaction = config.sandboxEnabled
    ? await createPaseoToPendulumXCM(pendulumEphemeralAddress, "usdc", inputAmountRaw)
    : await createAssethubToPendulumXCM(pendulumEphemeralAddress, "usdc", inputAmountRaw);
  const originNetwork = config.sandboxEnabled ? Networks.Paseo : fromNetwork;

  unsignedTxs.push({
    meta: {},
    network: originNetwork,
    nonce: 0,
    phase: "assethubToPendulum",
    signer: userAddress,
    txData: encodeSubmittableExtrinsic(assethubToPendulumTransaction)
  });
}

/**
 * Creates Nabla swap transactions for Pendulum
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function createNablaSwapTransactions(
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

  const inputAmountForNablaSwapRaw = quote.metadata.nablaSwap.inputAmountForSwapRaw;
  const outputAmountRaw = Big(quote.metadata.nablaSwap.outputAmountRaw);

  const nablaSoftMinimumOutputRaw = outputAmountRaw.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN).toFixed(0, 0);
  const nablaHardMinimumOutputRaw = outputAmountRaw.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN).toFixed(0, 0);

  const { approve, swap } = await createNablaTransactionsForOfframp(
    inputAmountForNablaSwapRaw,
    account,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw
  );

  unsignedTxs.push({
    meta: {},
    network: Networks.Pendulum,
    nonce: nextNonce,
    phase: "nablaApprove",
    signer: account.address,
    txData: approve.transaction
  });
  nextNonce++;

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
 * Creates BRL-specific transactions for Pendulum to Moonbeam transfer
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param pendulumCleanupTx Cleanup transaction template
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function createBRLTransactions(
  params: {
    brlaEvmAddress: string;
    outputAmountRaw: string;
    outputTokenPendulumDetails: PendulumTokenDetails;
    account: AccountMeta;
    taxId: string;
    pixDestination: string;
    receiverTaxId: string;
  },
  unsignedTxs: UnsignedTx[],
  pendulumCleanupTx: Omit<UnsignedTx, "nonce">,
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { brlaEvmAddress, outputAmountRaw, outputTokenPendulumDetails, account, taxId, pixDestination, receiverTaxId } = params;

  const pendulumToMoonbeamTransaction = await createPendulumToMoonbeamTransfer(
    brlaEvmAddress,
    outputAmountRaw,
    outputTokenPendulumDetails.currencyId
  );

  unsignedTxs.push({
    meta: {},
    network: Networks.Pendulum,
    nonce: nextNonce,
    phase: "pendulumToMoonbeamXcm",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(pendulumToMoonbeamTransaction)
  });
  nextNonce++;

  // Add the cleanup transaction with the next nonce
  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: nextNonce
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      brlaEvmAddress,
      pixDestination,
      receiverTaxId,
      taxId
    }
  };
}

/**
 * Creates mock approve and swap transactions for sandbox mode
 * @param inputAmountRaw The raw input amount to approve
 * @returns Mock approve and swap transaction data
 */
function createSandboxEvmTransactions(inputAmountRaw: string): {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
} {
  const USDC_POLYGON_AMOY = "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582" as `0x${string}`;
  const MOCK_SQUIDROUTER_RECEIVER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    args: [MOCK_SQUIDROUTER_RECEIVER, inputAmountRaw],
    functionName: "approve"
  });

  const approveData: EvmTransactionData = {
    data: approveTransactionData as `0x${string}`,
    gas: "150000",
    maxFeePerGas: "1000000000",
    maxPriorityFeePerGas: "1000000000",
    to: USDC_POLYGON_AMOY,
    value: "0"
  };

  // Swap transaction: simply a native transfer to mock squidrouter swap.
  const transferValue = "100000000000000";

  const swapData: EvmTransactionData = {
    data: "0x" as `0x${string}`,
    gas: "21000",
    maxFeePerGas: "1000000000",
    maxPriorityFeePerGas: "1000000000",
    to: MOCK_SQUIDROUTER_RECEIVER,
    value: transferValue
  };

  return { approveData, swapData };
}
