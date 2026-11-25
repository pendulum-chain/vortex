import { EvmToken, Networks, QuoteError, type RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { zeroAddress } from "viem";
import { APIError } from "../../../../../errors/api-error";
import { estimatePresignedExecutionFeeUsd } from "../../core/evm-destination-gas";
import { overrideFees } from "../../core/fees";
import { type GOLD_TOKEN, isBaseUsdcGoldRoute } from "../../core/gold-base";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import {
  probeStockPermit,
  STOCK_PERMIT_GAS_LIMIT,
  type StockPermitSimulationDependencies,
  type StockPermitSourceMetadata
} from "../stock-permit-source/simulation";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";

export type GoldSourceToken = typeof EvmToken.USDC | typeof GOLD_TOKEN;

/** The funding wallet's `permit`, the ephemeral's pull, and the swap's approval and swap, all on Base. */
const GOLD_SOURCE_GAS_LIMIT = 2n * STOCK_PERMIT_GAS_LIMIT + UNISWAP_APPROVE_GAS_LIMIT + UNISWAP_SWAP_GAS_LIMIT;
/** What a USDC route adds on Base after the swap: the fee transfers and the delivery to the user's wallet. */
const GOLD_USDC_ROUTE_EXTRA_GAS_LIMIT = 300_000n;

/**
 * Pass-through. Gold never falls back to a wallet-paid transfer, so a token without a readable permit is unavailable.
 * Sets the network fee `DistributeFees` deducts later, everything spent on Base, and on the USDC routes a zero anchor
 * fee, because no fiat provider is involved.
 */
export async function simulateGoldPermitSource<Token extends GoldSourceToken>(
  token: Token,
  input: PhaseIO<Token, typeof Networks.Base>,
  ctx: PhaseCtx,
  dependencies: StockPermitSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<Token, typeof Networks.Base>, StockPermitSourceMetadata>> {
  if (input.chain !== Networks.Base || input.token !== token || BigInt(input.amountRaw) <= 0n) {
    throw new Error(`GoldPermitSource requires a positive ${token} amount on ${Networks.Base}`);
  }
  if (!ctx.fees?.usd) throw new Error("GoldPermitSource: Missing fee snapshot");

  const usdcRoute = isBaseUsdcGoldRoute(ctx.request);
  const [permit, networkFeeUsd] = await Promise.all([
    (dependencies.probePermit ?? probeStockPermit)(token, zeroAddress),
    (dependencies.estimateExecutionFeeUsd ?? estimatePresignedExecutionFeeUsd)(
      Networks.Base,
      GOLD_SOURCE_GAS_LIMIT + (usdcRoute ? GOLD_USDC_ROUTE_EXTRA_GAS_LIMIT : 0n)
    )
  ]);
  if (!permit) {
    throw new APIError({
      isPublic: true,
      message:
        token === EvmToken.USDC
          ? QuoteError.StockUsdcFundingUnavailable
          : "Selling this token is temporarily unavailable. Please try again later.",
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }
  if (
    token === EvmToken.USDC &&
    input.amount.lte(new Big(networkFeeUsd).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup))
  ) {
    throw new APIError({
      isPublic: true,
      message: "USDC amount is too low to cover execution fees",
      status: httpStatus.BAD_REQUEST
    });
  }
  const usd = EvmToken.USDC as RampCurrency;
  ctx.addNote(`GoldPermitSource: permit from the owner, ${networkFeeUsd} USD on Base`);
  return {
    // On a Pix sell the anchor is a placeholder until AveniaOfframpFee prices it.
    fees: await overrideFees(ctx, {
      anchor: { amount: usdcRoute ? "0" : ctx.fees.usd.anchor, currency: usd },
      network: { amount: networkFeeUsd, currency: usd }
    }),
    metadata: { amountRaw: input.amountRaw, gasless: true, network: Networks.Base, networkFeeUsd, token },
    output: input
  };
}
