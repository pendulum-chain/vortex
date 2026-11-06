import {
  EphemeralAccountType,
  EvmClientManager,
  type EvmTransactionData,
  getRelayQuote,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  RELAY_BASE_CHAIN_ID,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_INPUT_ABOVE_QUOTE,
  RELAY_ROBINHOOD_CHAIN_ID,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  RelayApiError,
  type RelaySignableTransaction,
  RelayValidationError,
  validateRelayCalldataDeposit,
  validateRelayStrictDeposit
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import { APIError } from "../../../../../errors/api-error";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import type { PrepareCtx, PreparedPhaseTxs, TxIntent } from "../../core/types";
import { encodeUniswapSwap, UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";
import type { StockRouteSwapMetadata } from "../uniswap-v3-fixed-swap/route";
import type { UniswapV3TransactionDependencies } from "../uniswap-v3-fixed-swap/transactions";
import { RELAY_SELL_SLIPPAGE_TOLERANCE_BPS, type StockRouteMetadata, type StockRouteState } from "./simulation";

/** Nothing to carry between `register` and `prepareTxs`. */
export type StockRouteFacts = Record<string, never>;

/** Relay calldata orders live 7 days. They must outlast the 3 days a paid `initial` ramp can still be recovered and started. */
const RELAY_BUY_MIN_ORDER_LIFETIME_SECONDS = 4 * 24 * 60 * 60;
/** Of the output quoted for a sell, scaled to the order's input: the order's own slippage plus as much again for fee drift. */
const RELAY_SELL_MINIMUM_OUTPUT_RATIO = 0.99;

type FeeFields = Pick<EvmTransactionData, "maxFeePerGas" | "maxPriorityFeePerGas">;

function toAddress(value: string): `0x${string}` {
  return value as `0x${string}`;
}

function swapDeadline(dependencies: UniswapV3TransactionDependencies): { deadline: bigint; nowSeconds: number } {
  const nowSeconds = Math.floor((dependencies.now?.() ?? Date.now()) / 1000);
  return { deadline: BigInt(nowSeconds + config.swap.deadlineMinutes * 60), nowSeconds };
}

async function probeRobinhoodFees(dependencies: UniswapV3TransactionDependencies): Promise<FeeFields> {
  const probe = dependencies.probeFees
    ? await dependencies.probeFees()
    : await EvmClientManager.getInstance().getClient(Networks.Robinhood).estimateFeesPerGas();
  return {
    maxFeePerGas: probe.maxFeePerGas.toString(),
    maxPriorityFeePerGas: probe.maxPriorityFeePerGas.toString()
  };
}

function approveTxData(token: string, spender: string, amount: bigint, fees: FeeFields): EvmTransactionData {
  return {
    data: encodeFunctionData({ abi: erc20Abi, args: [toAddress(spender), amount], functionName: "approve" }),
    ...fees,
    gas: UNISWAP_APPROVE_GAS_LIMIT.toString(),
    to: toAddress(token),
    value: "0"
  };
}

function swapIntents(
  swap: StockRouteSwapMetadata,
  signer: string,
  recipient: string,
  deadline: bigint,
  fees: FeeFields
): [TxIntent, TxIntent] {
  const prefund = (gas: bigint) => (gas * BigInt(fees.maxFeePerGas as string) * PRESIGNED_EVM_FEE_MULTIPLIER).toString();
  const amountIn = BigInt(swap.inputAmountRaw);
  return [
    {
      lane: "main",
      network: Networks.Robinhood,
      phase: "uniswapApprove",
      prefundNativeValueRaw: prefund(UNISWAP_APPROVE_GAS_LIMIT),
      signer,
      txData: approveTxData(swap.inputToken, swap.router, amountIn, fees)
    },
    {
      lane: "main",
      network: Networks.Robinhood,
      phase: "uniswapSwap",
      prefundNativeValueRaw: prefund(UNISWAP_SWAP_GAS_LIMIT),
      signer,
      txData: {
        data: encodeUniswapSwap(swap.routerKind, {
          amountIn,
          amountOutMinimum: BigInt(swap.hardMinimumOutputRaw),
          deadline,
          path: toAddress(swap.path),
          recipient: toAddress(recipient)
        }),
        ...fees,
        gas: UNISWAP_SWAP_GAS_LIMIT.toString(),
        to: toAddress(swap.router),
        value: "0"
      }
    }
  ];
}

/**
 * Operator recovery only. Like every ephemeral transaction it is signed for five consecutive nonces,
 * so pinning it to the first main nonce keeps it broadcastable however far the main lane got.
 */
function backupApproveIntent(
  phase: "relayBackupApprove" | "stockBackupApprove",
  token: string,
  amount: bigint,
  signer: string,
  fees: FeeFields
): TxIntent {
  return {
    lane: "backup",
    network: Networks.Robinhood,
    phase,
    reuseFirstMainNonce: true,
    signer,
    txData: approveTxData(token, getEvmFundingAccount(Networks.Robinhood).address, amount, fees)
  };
}

function relayIntent(phase: "relayApprove" | "relayBridge", signer: string, transaction: RelaySignableTransaction): TxIntent {
  const { chainId: _chainId, ...txData } = transaction;
  return { lane: "main", network: Networks.Base, phase, signer, txData };
}

/** A sound order that no longer fits the quote, or Relay being unreachable, is cured by a new quote. Anything else stays a hard failure. */
function relayOrderFailure(error: unknown, quoteMovedCheck: string): unknown {
  const quoteMoved = error instanceof RelayValidationError && error.check === quoteMovedCheck;
  if (!quoteMoved && !(error instanceof RelayApiError)) return error;
  logger.warn(`RELAY_ORDER_UNAVAILABLE: ${error.message}`);
  return new APIError({
    isPublic: true,
    message: "The bridge quote is no longer available. Please request a new quote.",
    status: httpStatus.SERVICE_UNAVAILABLE
  });
}

export async function prepareStockRouteBuyTxs(
  ctx: PrepareCtx<StockRouteMetadata, StockRouteFacts>,
  dependencies: UniswapV3TransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const signer = requireAccount(ctx.accounts, EphemeralAccountType.EVM).address;
  const { bridge, swap } = ctx.ownMetadata;
  const { deadline, nowSeconds } = swapDeadline(dependencies);
  const fees = await probeRobinhoodFees(dependencies);

  const deposit = await getRelayQuote({
    amount: bridge.outputAmountRaw,
    destinationChainId: RELAY_ROBINHOOD_CHAIN_ID,
    destinationCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
    includeProtocolData: true,
    originChainId: RELAY_BASE_CHAIN_ID,
    originCurrency: RELAY_BASE_USDC_ADDRESS,
    recipient: signer,
    refundTo: signer,
    tradeType: "EXACT_OUTPUT",
    user: signer
  })
    .then(quote =>
      validateRelayCalldataDeposit(quote, {
        ephemeral: signer,
        maxInputAmountRaw: bridge.inputAmountRaw,
        minDeadlineUnix: nowSeconds + RELAY_BUY_MIN_ORDER_LIFETIME_SECONDS,
        outputAmountRaw: bridge.outputAmountRaw
      })
    )
    .catch(error => {
      throw relayOrderFailure(error, RELAY_INPUT_ABOVE_QUOTE);
    });

  return {
    intents: [
      relayIntent("relayApprove", signer, deposit.approveTx),
      relayIntent("relayBridge", signer, deposit.depositTx),
      ...swapIntents(swap, signer, signer, deadline, fees),
      backupApproveIntent("stockBackupApprove", swap.inputToken, BigInt(swap.inputAmountRaw), signer, fees)
    ],
    state: {
      relayInputAmountRaw: deposit.inputAmountRaw,
      relayRequestId: deposit.requestId,
      swapDeadline: deadline.toString()
    } satisfies StockRouteState
  };
}

export async function prepareStockRouteSellTxs(
  ctx: PrepareCtx<StockRouteMetadata, StockRouteFacts>,
  dependencies: UniswapV3TransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const signer = requireAccount(ctx.accounts, EphemeralAccountType.EVM).address;
  const { bridge, swap } = ctx.ownMetadata;
  const { deadline } = swapDeadline(dependencies);
  const fees = await probeRobinhoodFees(dependencies);

  // The order is sized at the swap's hard minimum, so any swap that does not revert overpays it and is filled in full.
  const deposit = await getRelayQuote({
    amount: swap.hardMinimumOutputRaw,
    destinationChainId: RELAY_BASE_CHAIN_ID,
    destinationCurrency: RELAY_BASE_USDC_ADDRESS,
    includeProtocolData: true,
    originChainId: RELAY_ROBINHOOD_CHAIN_ID,
    originCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
    recipient: signer,
    refundTo: signer,
    slippageTolerance: RELAY_SELL_SLIPPAGE_TOLERANCE_BPS,
    strict: true,
    tradeType: "EXACT_INPUT",
    useDepositAddress: true,
    user: signer
  })
    .then(quote =>
      validateRelayStrictDeposit(quote, {
        ephemeral: signer,
        inputAmountRaw: swap.hardMinimumOutputRaw,
        minDeadlineUnix: Number(deadline),
        minOutputAmountRaw: new Big(bridge.outputAmountRaw)
          .mul(swap.hardMinimumOutputRaw)
          .div(bridge.inputAmountRaw)
          .mul(RELAY_SELL_MINIMUM_OUTPUT_RATIO)
          .toFixed(0, 0),
        swapRouter: swap.router
      })
    )
    .catch(error => {
      throw relayOrderFailure(error, "output.minimumAmount");
    });

  return {
    intents: [
      ...swapIntents(swap, signer, deposit.depositAddress, deadline, fees),
      backupApproveIntent("stockBackupApprove", swap.inputToken, BigInt(swap.inputAmountRaw), signer, fees),
      // What a Relay refund returns is unknown at registration.
      backupApproveIntent("relayBackupApprove", RELAY_ROBINHOOD_USDG_ADDRESS, maxUint256, signer, fees)
    ],
    state: {
      relayDepositAddress: deposit.depositAddress,
      relayMinimumOutputRaw: deposit.minimumOutputRaw,
      relayRequestId: deposit.requestId,
      swapDeadline: deadline.toString()
    } satisfies StockRouteState
  };
}
