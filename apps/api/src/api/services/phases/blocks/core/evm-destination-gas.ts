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
  PRESIGNED_EVM_FEE_MULTIPLIER,
  QuoteError,
  type RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { formatUnits, parseAbi, parseTransaction, type TransactionSerialized } from "viem";
import { config } from "../../../../../config/vars";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import type { EvmDestinationGasQuote } from "./metadata";
import type { PhaseCtx } from "./types";

export const EVM_NATIVE_TRANSFER_GAS_LIMIT = 21_000n;
export const EVM_ERC20_TRANSFER_GAS_LIMIT = 100_000n;

// Base's GasPriceOracle adds the signed fields itself. These conservative unsigned
// EIP-1559 sizes cover a native transfer and an ERC-20 transfer respectively.
export const EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES = 128n;
export const EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES = 256n;

const BASE_GAS_PRICE_ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";
const BASE_GAS_PRICE_ORACLE_ABI = parseAbi([
  "function getL1Fee(bytes transaction) view returns (uint256)",
  "function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)"
]);

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

export function calculatePresignedGasBudgetRaw(rawTransaction: `0x${string}`): bigint {
  const transaction = parseTransaction(rawTransaction as TransactionSerialized);
  const feePerGas = transaction.maxFeePerGas ?? transaction.gasPrice;
  if (transaction.gas === undefined || feePerGas === undefined) {
    throw new Error("EVM destination transaction is missing gas or fee data");
  }
  return transaction.gas * feePerGas;
}

export function calculateBoundedPresignedGasBudgetRaw(
  rawTransaction: `0x${string}`,
  unsignedTransaction: EvmTransactionData
): bigint {
  const transaction = parseTransaction(rawTransaction as TransactionSerialized);
  const feePerGas = transaction.maxFeePerGas ?? transaction.gasPrice;
  if (transaction.gas === undefined || feePerGas === undefined) {
    throw new Error("EVM destination transaction is missing gas or fee data");
  }

  if (!unsignedTransaction.maxFeePerGas) {
    throw new Error("Server-issued EVM destination transaction is missing maxFeePerGas");
  }
  const expectedGas = BigInt(unsignedTransaction.gas);
  const maximumFeePerGas = BigInt(unsignedTransaction.maxFeePerGas) * PRESIGNED_EVM_FEE_MULTIPLIER;
  if (transaction.gas !== expectedGas || feePerGas > maximumFeePerGas) {
    throw new Error("EVM destination transaction exceeds its server-issued gas envelope");
  }
  return transaction.gas * feePerGas;
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

export async function getBaseL1FeeRaw(network: EvmNetworks, rawTransaction: `0x${string}`): Promise<bigint> {
  if (!isBaseNetwork(network)) return 0n;

  const client = EvmClientManager.getInstance().getClient(network);
  return (await client.readContract({
    abi: BASE_GAS_PRICE_ORACLE_ABI,
    address: BASE_GAS_PRICE_ORACLE_ADDRESS,
    args: [rawTransaction],
    functionName: "getL1Fee"
  })) as bigint;
}

export async function calculatePresignedExecutionBudgetRaw(
  rawTransaction: `0x${string}`,
  network: EvmNetworks,
  unsignedTransaction?: EvmTransactionData
): Promise<bigint> {
  const l2Budget = unsignedTransaction
    ? calculateBoundedPresignedGasBudgetRaw(rawTransaction, unsignedTransaction)
    : calculatePresignedGasBudgetRaw(rawTransaction);
  return l2Budget + (await getBaseL1FeeRaw(network, rawTransaction));
}

export function calculateExpectedExecutionFeeRaw(
  maxFeePerGas: bigint,
  transferGasLimit: bigint,
  marginBps: number,
  l1FeeUpperBoundRaw = 0n
): bigint {
  const executionGasLimit = EVM_NATIVE_TRANSFER_GAS_LIMIT + transferGasLimit;
  return ((executionGasLimit * maxFeePerGas + l1FeeUpperBoundRaw) * BigInt(marginBps) + 9_999n) / 10_000n;
}

function getMaximumQuotedFeePerGas(quote: EvmDestinationGasQuote): bigint {
  return (BigInt(quote.maxFeePerGas) * BigInt(config.evmDestinationGas.networkFeeMarginBps) + 9_999n) / 10_000n;
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

  if (BigInt(transaction.maxFeePerGas) > getMaximumQuotedFeePerGas(quote)) {
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
  if (maxFeePerGas > getMaximumQuotedFeePerGas(quote)) {
    throwNetworkFeesTooHigh();
  }
  if (!isBaseNetwork(network)) return;
  if (quote.fundingL1FeeUpperBoundRaw === undefined || quote.payoutL1FeeUpperBoundRaw === undefined) {
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
  const marginBps = BigInt(config.evmDestinationGas.networkFeeMarginBps);
  const maximumFundingL1Fee = (BigInt(quote.fundingL1FeeUpperBoundRaw) * marginBps + 9_999n) / 10_000n;
  const maximumPayoutL1Fee = (BigInt(quote.payoutL1FeeUpperBoundRaw) * marginBps + 9_999n) / 10_000n;
  if (currentFundingL1FeeUpperBound > maximumFundingL1Fee || currentPayoutL1FeeUpperBound > maximumPayoutL1Fee) {
    throwNetworkFeesTooHigh();
  }
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

  const transferGasLimit = isNativeEvmToken(tokenDetails) ? EVM_NATIVE_TRANSFER_GAS_LIMIT : EVM_ERC20_TRANSFER_GAS_LIMIT;
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
  const expectedFeeRaw = calculateExpectedExecutionFeeRaw(
    maxFeePerGas,
    transferGasLimit,
    config.evmDestinationGas.networkFeeMarginBps,
    fundingL1FeeUpperBoundRaw + payoutL1FeeUpperBoundRaw
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
    fundingL1FeeUpperBoundRaw: fundingL1FeeUpperBoundRaw.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    network: destinationNetwork,
    payoutL1FeeUpperBoundRaw: payoutL1FeeUpperBoundRaw.toString(),
    transferGasLimit: transferGasLimit.toString()
  };
  ctx.addNote(`${destinationNetwork} destination execution fee: ${expectedFeeUsd} USD`);
  return expectedFeeUsd;
}
