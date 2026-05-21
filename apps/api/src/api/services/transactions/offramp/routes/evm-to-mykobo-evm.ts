import {
  createOfframpSquidrouterTransactionsToEvm,
  ERC20_EURC_BASE,
  EvmClientManager,
  EvmTransactionData,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
  UnsignedTx
} from "@vortexfi/shared";
import { encodeFunctionData } from "viem";
import erc20ABI from "../../../../../contracts/ERC20";
import { MYKOBO_BASE_NETWORK } from "../../../mykobo";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";

const addressesEqual = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Prepares all transactions for an EVM → Mykobo offramp (EUR payout).
 * Source is Base (or BaseSepolia). If the input is already EURC on Base, a single ERC-20
 * transfer to the per-withdraw settlement address is enough. Otherwise we route through
 * Squidrouter (with destination = settlement address) to land EURC on Base.
 *
 * The settlement address is obtained per-transaction from POST /v1/transactions/intent
 * (transaction_type=WITHDRAW) and must be passed in via params.mykoboSettlementAddress.
 */
export async function prepareEvmToMykoboOfframpTransactions({
  quote,
  userAddress,
  mykoboSettlementAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  const stateMeta: Partial<StateMetadata> = {};

  if (!mykoboSettlementAddress) {
    throw new Error("Mykobo settlement address is required (must come from createMykoboWithdrawIntent)");
  }

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  if (fromNetwork !== MYKOBO_BASE_NETWORK) {
    throw new Error(`Mykobo offramp only supports ${MYKOBO_BASE_NETWORK} as source network, got ${fromNetwork}`);
  }

  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
  if (!inputTokenDetails) {
    throw new Error(`Input token details not found for ${quote.inputCurrency} on network ${fromNetwork}`);
  }
  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error("Mykobo offramp source must be an EVM token");
  }

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }

  const inputAmountRaw = quote.metadata.mykoboOffRamp?.inputAmountRaw ?? quote.metadata.evmToEvm?.inputAmountRaw;
  if (!inputAmountRaw) {
    throw new Error("Mykobo offramp requires inputAmountRaw in quote metadata");
  }

  const isAlreadyBaseEurc = addressesEqual(inputTokenDetails.erc20AddressSourceChain, ERC20_EURC_BASE);

  if (isAlreadyBaseEurc) {
    const transferData = encodeFunctionData({
      abi: erc20ABI,
      args: [mykoboSettlementAddress as `0x${string}`, BigInt(inputAmountRaw)],
      functionName: "transfer"
    });

    const baseClient = EvmClientManager.getInstance().getClient(MYKOBO_BASE_NETWORK);
    const { maxFeePerGas } = await baseClient.estimateFeesPerGas();

    const transferTx: EvmTransactionData = {
      data: transferData as `0x${string}`,
      gas: "100000",
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxFeePerGas),
      to: ERC20_EURC_BASE,
      value: "0"
    };

    unsignedTxs.push({
      meta: {},
      network: fromNetwork,
      nonce: 0,
      phase: "destinationTransfer",
      signer: userAddress,
      txData: encodeEvmTransactionData(transferTx) as EvmTransactionData
    });

    return { stateMeta, unsignedTxs };
  }

  const { approveData, swapData } = await createOfframpSquidrouterTransactionsToEvm({
    destinationAddress: mykoboSettlementAddress,
    fromAddress: userAddress,
    fromNetwork,
    fromToken: inputTokenDetails.erc20AddressSourceChain,
    rawAmount: inputAmountRaw,
    toNetwork: MYKOBO_BASE_NETWORK,
    toToken: ERC20_EURC_BASE
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterApprove",
    signer: userAddress,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 1,
    phase: "squidRouterSwap",
    signer: userAddress,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  return { stateMeta, unsignedTxs };
}
