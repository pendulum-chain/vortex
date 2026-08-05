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
  QuoteError,
  type RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { formatUnits, parseTransaction, type TransactionSerialized } from "viem";
import { config } from "../../../../../config/vars";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import type { EvmDestinationGasQuote } from "./metadata";
import type { PhaseCtx } from "./types";

export const EVM_NATIVE_TRANSFER_GAS_LIMIT = 21_000n;
export const EVM_ERC20_TRANSFER_GAS_LIMIT = 100_000n;

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

export function calculateExpectedExecutionFeeRaw(maxFeePerGas: bigint, transferGasLimit: bigint, marginBps: number): bigint {
  const executionGasLimit = EVM_NATIVE_TRANSFER_GAS_LIMIT + transferGasLimit;
  return (executionGasLimit * maxFeePerGas * BigInt(marginBps) + 9_999n) / 10_000n;
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

  const maximumFeePerGas =
    (BigInt(quote.maxFeePerGas) * BigInt(config.evmDestinationGas.networkFeeMarginBps) + 9_999n) / 10_000n;
  if (BigInt(transaction.maxFeePerGas) > maximumFeePerGas) {
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
  const expectedFeeRaw = calculateExpectedExecutionFeeRaw(
    maxFeePerGas,
    transferGasLimit,
    config.evmDestinationGas.networkFeeMarginBps
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
    maxFeePerGas: maxFeePerGas.toString(),
    network: destinationNetwork,
    transferGasLimit: transferGasLimit.toString()
  };
  ctx.addNote(`${destinationNetwork} destination execution fee: ${expectedFeeUsd} USD`);
  return expectedFeeUsd;
}
