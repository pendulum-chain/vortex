import {
  EvmToken,
  getNetworkFromDestination,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig, SquidRouterData } from "./index";

export class OnRampSquidRouterBrlToEvmEngineBase extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSquidRouterBrlToEvmEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error(
        "OnRampSquidRouterBrlToEvmEngine: Skipped because destination is assethub, this engine handles EVM destinations only"
      );
    }

    if (!ctx.nablaSwapEvm) {
      throw new Error(
        "OnRampSquidRouterBrlToEvmEngine: Missing nablaSwapEvm.outputAmountDecimal in context - ensure initialize stage ran successfully"
      );
    }

    if (!ctx.fees?.usd || !ctx.fees?.displayFiat) {
      throw new Error("OnRampPendulumTransferEngine: Missing fees in context - ensure fee calculation ran successfully");
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
    // skip for the trivial case scenario.
    if (ctx.to === Networks.Base && ctx.request.outputCurrency === EvmToken.USDC) {
      return {
        data: {
          skipRouteCalculation: true
        } as SquidRouterData,
        type: "evm-to-evm"
      };
    }

    const req = ctx.request;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const usdFees = ctx.fees!.usd!;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwapEvm!;

    // Deduce fees distributed after Nabla swap and before transfer to next destination
    // Onramps always have a USD-stablecoin as output, so we can use the USD fee structure
    const usdFeesDistributedDecimal = Big(usdFees.network).plus(usdFees.vortex).plus(usdFees.partnerMarkup);
    const usdFeesDistributedRaw = multiplyByPowerOfTen(usdFeesDistributedDecimal, nablaSwap.outputDecimals);

    const inputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal)).minus(usdFeesDistributedDecimal);
    const inputAmountRaw = this.mergeSubsidyRaw(ctx, new Big(nablaSwap.outputAmountRaw))
      .minus(usdFeesDistributedRaw)
      .toFixed(0, 0);

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new APIError({
        message: `Invalid network for destination: ${req.to} `,
        status: httpStatus.BAD_REQUEST
      });
    }

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, req.to).erc20AddressSourceChain;

    const usdcBaseTokenDetails = getTokenDetailsForEvmDestination(EvmToken.USDC, Networks.Base);

    return {
      data: {
        amountRaw: inputAmountRaw,
        fromNetwork: Networks.Base,
        fromToken: usdcBaseTokenDetails.erc20AddressSourceChain,
        inputAmountDecimal: inputAmountDecimal,
        inputAmountRaw: inputAmountRaw,
        outputDecimals: usdcBaseTokenDetails.decimals,
        toNetwork,
        toToken
      },
      type: "evm-to-evm"
    };
  }
}
