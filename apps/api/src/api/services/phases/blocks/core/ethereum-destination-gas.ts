import {
  EvmClientManager,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isNativeEvmToken,
  Networks,
  type OnChainToken,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  QuoteError,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { formatEther, parseEther, parseTransaction, type TransactionSerialized } from "viem";
import { config } from "../../../../../config/vars";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import type { PhaseCtx } from "./types";

export const EVM_NATIVE_TRANSFER_GAS_LIMIT = 21_000n;
export const EVM_ERC20_TRANSFER_GAS_LIMIT = 100_000n;

function ethereumGasFundingLimitRaw(): bigint {
  return parseEther(config.ethereumOnramp.maxGasFundingUnits);
}

export function assertEthereumGasBudgetWithinLimit(gasBudgetRaw: bigint): void {
  if (gasBudgetRaw > ethereumGasFundingLimitRaw()) {
    throw new APIError({ message: QuoteError.NetworkFeesTooHigh, status: httpStatus.SERVICE_UNAVAILABLE });
  }
}

export function calculatePresignedGasBudgetRaw(rawTransaction: `0x${string}`): bigint {
  const transaction = parseTransaction(rawTransaction as TransactionSerialized);
  const feePerGas = transaction.maxFeePerGas ?? transaction.gasPrice;
  if (transaction.gas === undefined || feePerGas === undefined) {
    throw new Error("Ethereum destination transaction is missing gas or fee data");
  }
  return transaction.gas * feePerGas;
}

export function calculateExpectedExecutionFeeRaw(maxFeePerGas: bigint, transferGasLimit: bigint, marginBps: number): bigint {
  const executionGasLimit = EVM_NATIVE_TRANSFER_GAS_LIMIT + transferGasLimit;
  return (executionGasLimit * maxFeePerGas * BigInt(marginBps) + 9_999n) / 10_000n;
}

export async function getEthereumDestinationExecutionFeeUsd(ctx: PhaseCtx): Promise<string> {
  if (ctx.request.rampType !== RampDirection.BUY || ctx.request.to !== Networks.Ethereum) {
    return "0";
  }
  if (ctx.ethereumDestinationFeeUsd !== undefined) {
    return ctx.ethereumDestinationFeeUsd;
  }

  const tokenDetails = getOnChainTokenDetails(Networks.Ethereum, ctx.request.outputCurrency as OnChainToken);
  if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
    throw new Error(`Ethereum output token ${ctx.request.outputCurrency} is not configured`);
  }

  const transferGasLimit = isNativeEvmToken(tokenDetails) ? EVM_NATIVE_TRANSFER_GAS_LIMIT : EVM_ERC20_TRANSFER_GAS_LIMIT;
  const ethereumClient = EvmClientManager.getInstance().getClient(Networks.Ethereum);
  const { maxFeePerGas } = await ethereumClient.estimateFeesPerGas();
  const signedTransferGasBudgetRaw = transferGasLimit * maxFeePerGas * PRESIGNED_EVM_FEE_MULTIPLIER;
  assertEthereumGasBudgetWithinLimit(signedTransferGasBudgetRaw);

  const expectedFeeRaw = calculateExpectedExecutionFeeRaw(
    maxFeePerGas,
    transferGasLimit,
    config.ethereumOnramp.networkFeeMarginBps
  );
  const ethereumPriceUsd = await priceFeedService.getCryptoPrice("ethereum", "usd");
  const expectedFeeUsd = new Big(formatEther(expectedFeeRaw)).mul(ethereumPriceUsd).toFixed(6);

  if (new Big(expectedFeeUsd).gt(config.ethereumOnramp.maxDestinationFeeUsd)) {
    throw new APIError({ message: QuoteError.NetworkFeesTooHigh, status: httpStatus.SERVICE_UNAVAILABLE });
  }

  ctx.ethereumDestinationFeeUsd = expectedFeeUsd;
  ctx.addNote(`Ethereum destination execution fee: ${expectedFeeUsd} USD`);
  return expectedFeeUsd;
}
