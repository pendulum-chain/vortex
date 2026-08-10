import {
  EvmClientManager,
  type EvmNetworks,
  EvmToken,
  type EvmTransactionData,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isNativeEvmToken,
  isNetworkEVM,
  Networks,
  type OnChainToken,
  type PresignedTx,
  QuoteError,
  type RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { encodeFunctionData, erc20Abi, formatUnits, parseAbi, parseTransaction, type TransactionSerialized } from "viem";
import { config } from "../../../../../config/vars";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { validatePresignedEvmTransactionAgainstUnsigned } from "../../../transactions/validation";
import type { EvmDestinationGasQuote } from "./metadata";
import type { PhaseCtx } from "./types";

export const EVM_NATIVE_TRANSFER_GAS_LIMIT = 21_000n;
export const EVM_ERC20_TRANSFER_GAS_LIMIT = 100_000n;
export const EVM_DESTINATION_FUNDING_PROGRAM_VERSION = 2 as const;

// Base's GasPriceOracle adds the signed fields itself. These conservative unsigned
// EIP-1559 sizes cover a native transfer and an ERC-20 transfer respectively.
export const EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES = 128n;
export const EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES = 256n;

const BASE_GAS_PRICE_ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";
const BASE_GAS_PRICE_ORACLE_ABI = parseAbi(["function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)"]);

const ARBITRUM_NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";
const ARBITRUM_NODE_INTERFACE_ABI = parseAbi([
  "function gasEstimateL1Component(address to, bool contractCreation, bytes data) view returns (uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)"
]);
const WORST_CASE_EVM_ADDRESS = "0xffffffffffffffffffffffffffffffffffffffff";
const WORST_CASE_ERC20_TRANSFER_DATA = encodeFunctionData({
  abi: erc20Abi,
  args: [WORST_CASE_EVM_ADDRESS, 2n ** 256n - 1n],
  functionName: "transfer"
});

const EVM_NATIVE_FEE_CURRENCIES: Record<EvmNetworks, RampCurrency> = {
  [Networks.Arbitrum]: "ETH" as RampCurrency,
  [Networks.Avalanche]: "AVAX" as RampCurrency,
  [Networks.Base]: "ETH" as RampCurrency,
  [Networks.BaseSepolia]: "ETH" as RampCurrency,
  [Networks.BSC]: "BNB" as RampCurrency,
  [Networks.Ethereum]: "ETH" as RampCurrency,
  [Networks.Moonbeam]: "GLMR" as RampCurrency,
  [Networks.Polygon]: "MATIC" as RampCurrency,
  [Networks.PolygonAmoy]: "MATIC" as RampCurrency
};

export function getEvmNativeFeeCurrency(network: EvmNetworks): RampCurrency {
  return EVM_NATIVE_FEE_CURRENCIES[network];
}

function throwNetworkFeesTooHigh(): never {
  throw new APIError({ message: QuoteError.NetworkFeesTooHigh, status: httpStatus.SERVICE_UNAVAILABLE });
}

function applyMarginBps(value: bigint, marginBps: number): bigint {
  return (value * BigInt(marginBps) + 9_999n) / 10_000n;
}

async function getArbitrumL1GasComponent(network: EvmNetworks, to: `0x${string}`, data: `0x${string}`): Promise<bigint> {
  if (network !== Networks.Arbitrum) return 0n;

  const client = EvmClientManager.getInstance().getClient(network);
  const result = (await client.readContract({
    abi: ARBITRUM_NODE_INTERFACE_ABI,
    account: WORST_CASE_EVM_ADDRESS,
    address: ARBITRUM_NODE_INTERFACE_ADDRESS,
    args: [to, false, data],
    functionName: "gasEstimateL1Component"
  })) as readonly [bigint, bigint, bigint];
  return result[0];
}

async function getArbitrumExecutionGasLimits(
  network: EvmNetworks,
  isNativeTransfer: boolean,
  marginBps = 10_000
): Promise<{ fundingGasLimit: bigint; transferGasLimit: bigint }> {
  const [fundingL1Gas, payoutL1Gas] = await Promise.all([
    getArbitrumL1GasComponent(network, WORST_CASE_EVM_ADDRESS, "0x"),
    getArbitrumL1GasComponent(network, WORST_CASE_EVM_ADDRESS, isNativeTransfer ? "0x" : WORST_CASE_ERC20_TRANSFER_DATA)
  ]);
  return {
    fundingGasLimit: EVM_NATIVE_TRANSFER_GAS_LIMIT + applyMarginBps(fundingL1Gas, marginBps),
    transferGasLimit:
      (isNativeTransfer ? EVM_NATIVE_TRANSFER_GAS_LIMIT : EVM_ERC20_TRANSFER_GAS_LIMIT) + applyMarginBps(payoutL1Gas, marginBps)
  };
}

export function calculatePresignedGasBudgetRaw(rawTransaction: `0x${string}`): bigint {
  const transaction = parseTransaction(rawTransaction as TransactionSerialized);
  const feePerGas = transaction.maxFeePerGas ?? transaction.gasPrice;
  if (transaction.gas === undefined || feePerGas === undefined) {
    throw new Error("EVM destination transaction is missing gas or fee data");
  }
  return transaction.gas * feePerGas;
}

export async function calculateBoundedPresignedGasBudgetRaw(
  presignedTransaction: PresignedTx,
  unsignedTransaction: PresignedTx
): Promise<bigint> {
  await validatePresignedEvmTransactionAgainstUnsigned(presignedTransaction, unsignedTransaction);
  if (typeof presignedTransaction.txData !== "string") {
    throw new Error("EVM destination transaction is not a signed transaction");
  }
  return calculatePresignedGasBudgetRaw(presignedTransaction.txData as `0x${string}`);
}

function isBaseNetwork(network: EvmNetworks): boolean {
  return network === Networks.Base || network === Networks.BaseSepolia;
}

export async function getBaseL1FeeUpperBoundRaw(network: EvmNetworks, unsignedTxSize: bigint): Promise<bigint> {
  if (!isBaseNetwork(network)) return 0n;

  const client = EvmClientManager.getInstance().getClient(network);
  return (await client.readContract({
    abi: BASE_GAS_PRICE_ORACLE_ABI,
    address: BASE_GAS_PRICE_ORACLE_ADDRESS,
    args: [unsignedTxSize],
    functionName: "getL1FeeUpperBound"
  })) as bigint;
}

export async function calculateQuotedPresignedExecutionBudgetRaw(
  presignedTransaction: PresignedTx,
  unsignedTransaction: PresignedTx,
  quote: EvmDestinationGasQuote
): Promise<bigint> {
  if (quote.programVersion !== EVM_DESTINATION_FUNDING_PROGRAM_VERSION || quote.network !== presignedTransaction.network) {
    throw new Error(`EVM destination funding quote does not support ${presignedTransaction.network}`);
  }
  if (isBaseNetwork(presignedTransaction.network) && quote.maximumPayoutL1FeeRaw === undefined) {
    throw new Error("Base destination gas quote is missing its payout L1 fee envelope");
  }
  const l1ReserveRaw = isBaseNetwork(presignedTransaction.network) ? BigInt(quote.maximumPayoutL1FeeRaw as string) : 0n;
  return (await calculateBoundedPresignedGasBudgetRaw(presignedTransaction, unsignedTransaction)) + l1ReserveRaw;
}

export function calculateExpectedExecutionFeeRaw(
  maximumFeePerGas: bigint,
  fundingGasLimit: bigint,
  transferGasLimit: bigint,
  maximumL1FeeRaw = 0n
): bigint {
  return (fundingGasLimit + transferGasLimit) * maximumFeePerGas + maximumL1FeeRaw;
}

export function assertPreparedEvmDestinationFeeWithinQuote(
  quote: EvmDestinationGasQuote,
  network: EvmNetworks,
  transaction: EvmTransactionData
): void {
  if (quote.network !== network) {
    throw new Error(`EVM destination gas quote is for ${quote.network}, not ${network}`);
  }
  if (transaction.gas !== quote.transferGasLimit) {
    throw new Error(`EVM destination gas limit changed from ${quote.transferGasLimit} to ${transaction.gas}`);
  }
  if (!transaction.maxFeePerGas) {
    throw new Error("Prepared EVM destination transaction is missing maxFeePerGas");
  }

  if (BigInt(transaction.maxFeePerGas) > BigInt(quote.maximumFeePerGas)) {
    throwNetworkFeesTooHigh();
  }
}

export async function assertEvmTreasuryFundingFeeWithinQuote(
  quote: EvmDestinationGasQuote,
  network: EvmNetworks,
  maxFeePerGas: bigint
): Promise<void> {
  if (quote.network !== network) {
    throw new Error(`EVM destination gas quote is for ${quote.network}, not ${network}`);
  }
  if (quote.programVersion !== EVM_DESTINATION_FUNDING_PROGRAM_VERSION) {
    throw new Error(`Unsupported EVM destination funding program ${String(quote.programVersion)}`);
  }
  if (maxFeePerGas > BigInt(quote.maximumFeePerGas)) {
    throwNetworkFeesTooHigh();
  }

  if (network === Networks.Arbitrum) {
    const currentGasLimits = await getArbitrumExecutionGasLimits(network, quote.isNativeTransfer);
    if (
      currentGasLimits.fundingGasLimit > BigInt(quote.fundingGasLimit) ||
      currentGasLimits.transferGasLimit > BigInt(quote.transferGasLimit)
    ) {
      throwNetworkFeesTooHigh();
    }
  }

  if (!isBaseNetwork(network)) return;
  if (quote.maximumFundingL1FeeRaw === undefined || quote.maximumPayoutL1FeeRaw === undefined) {
    throw new Error("Base destination gas quote is missing its L1 fee envelope");
  }

  const payoutTransactionSize =
    BigInt(quote.transferGasLimit) === EVM_NATIVE_TRANSFER_GAS_LIMIT
      ? EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES
      : EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES;
  const [currentFundingL1FeeUpperBound, currentPayoutL1FeeUpperBound] = await Promise.all([
    getBaseL1FeeUpperBoundRaw(network, EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES),
    getBaseL1FeeUpperBoundRaw(network, payoutTransactionSize)
  ]);
  if (
    currentFundingL1FeeUpperBound > BigInt(quote.maximumFundingL1FeeRaw) ||
    currentPayoutL1FeeUpperBound > BigInt(quote.maximumPayoutL1FeeRaw)
  ) {
    throwNetworkFeesTooHigh();
  }
}

export async function preflightEvmDestinationFeeWithinQuote(quote: EvmDestinationGasQuote): Promise<void> {
  const client = EvmClientManager.getInstance().getClient(quote.network);
  const { maxFeePerGas } = await client.estimateFeesPerGas();
  await assertEvmTreasuryFundingFeeWithinQuote(quote, quote.network, maxFeePerGas);
}

export async function getEvmDestinationExecutionFeeUsd(ctx: PhaseCtx): Promise<string> {
  const destinationNetwork = getNetworkFromDestination(ctx.request.to);
  if (
    ctx.request.rampType !== RampDirection.BUY ||
    ctx.priceEvmDestinationGas === false ||
    !destinationNetwork ||
    !isNetworkEVM(destinationNetwork)
  ) {
    return "0";
  }
  if (ctx.evmDestinationGas !== undefined) {
    return ctx.evmDestinationGas.executionFeeUsd;
  }

  const tokenDetails = getOnChainTokenDetails(destinationNetwork, ctx.request.outputCurrency as OnChainToken);
  if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
    throw new Error(`${destinationNetwork} output token ${ctx.request.outputCurrency} is not configured`);
  }

  const isNativeTransfer = isNativeEvmToken(tokenDetails);
  const destinationClient = EvmClientManager.getInstance().getClient(destinationNetwork);
  const chain = destinationClient.chain;
  if (!chain) {
    throw new Error(`Could not get chain info for EVM destination ${destinationNetwork}`);
  }
  const { maxFeePerGas } = await destinationClient.estimateFeesPerGas();
  const payoutTransactionSize = isNativeEvmToken(tokenDetails)
    ? EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES
    : EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES;
  const [fundingL1FeeUpperBoundRaw, payoutL1FeeUpperBoundRaw] = await Promise.all([
    getBaseL1FeeUpperBoundRaw(destinationNetwork, EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES),
    getBaseL1FeeUpperBoundRaw(destinationNetwork, payoutTransactionSize)
  ]);
  const marginBps = config.evmDestinationGas.networkFeeMarginBps;
  const { fundingGasLimit, transferGasLimit } = await getArbitrumExecutionGasLimits(
    destinationNetwork,
    isNativeTransfer,
    marginBps
  );
  const maximumFeePerGas = applyMarginBps(maxFeePerGas, marginBps);
  const maximumFundingL1FeeRaw = applyMarginBps(fundingL1FeeUpperBoundRaw, marginBps);
  const maximumPayoutL1FeeRaw = applyMarginBps(payoutL1FeeUpperBoundRaw, marginBps);
  const expectedFeeRaw = calculateExpectedExecutionFeeRaw(
    maximumFeePerGas,
    fundingGasLimit,
    transferGasLimit,
    maximumFundingL1FeeRaw + maximumPayoutL1FeeRaw
  );
  const expectedFeeUnits = formatUnits(expectedFeeRaw, chain.nativeCurrency.decimals);
  const expectedFeeUsd = new Big(
    await priceFeedService.convertCurrency(
      expectedFeeUnits,
      getEvmNativeFeeCurrency(destinationNetwork),
      EvmToken.USDC as RampCurrency
    )
  ).toFixed(6);

  if (new Big(expectedFeeUsd).gt(config.evmDestinationGas.maxExecutionFeeUsd)) {
    throwNetworkFeesTooHigh();
  }

  ctx.evmDestinationGas = {
    executionFeeUsd: expectedFeeUsd,
    fundingGasLimit: fundingGasLimit.toString(),
    isNativeTransfer,
    maximumFeePerGas: maximumFeePerGas.toString(),
    ...(isBaseNetwork(destinationNetwork)
      ? {
          maximumFundingL1FeeRaw: maximumFundingL1FeeRaw.toString(),
          maximumPayoutL1FeeRaw: maximumPayoutL1FeeRaw.toString()
        }
      : {}),
    network: destinationNetwork,
    programVersion: EVM_DESTINATION_FUNDING_PROGRAM_VERSION,
    transferGasLimit: transferGasLimit.toString()
  };
  ctx.addNote(`${destinationNetwork} destination execution fee: ${expectedFeeUsd} USD`);
  return expectedFeeUsd;
}
