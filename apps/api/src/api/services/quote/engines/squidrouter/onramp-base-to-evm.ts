import {
  EvmToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { getBridgeTargetTokenDetails, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { isBrlToBrlaBaseDirect, isEurToEurcBaseDirect } from "../../utils";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig } from "./index";

export class OnRampSquidRouterToBaseEngine extends BaseSquidRouterEngine {
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
    const req = ctx.request;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const usdFees = ctx.fees!.usd!;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwapEvm!;

    if (isEurToEurcBaseDirect(ctx.request.inputCurrency, ctx.request.outputCurrency, ctx.request.to)) {
      const eurcBaseTokenDetails = getOnChainTokenDetails(Networks.Base, EvmToken.EURC);
      if (!eurcBaseTokenDetails || eurcBaseTokenDetails.type !== "evm") {
        throw new Error("OnRampSquidRouterToBaseEngine: EURC Base token details not found");
      }

      const inputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal));
      const inputAmountRaw = this.mergeSubsidyRaw(ctx, new Big(nablaSwap.outputAmountRaw)).toFixed(0, 0);

      return {
        data: {
          amountRaw: inputAmountRaw,
          fromNetwork: Networks.Base,
          fromToken: eurcBaseTokenDetails.erc20AddressSourceChain,
          inputAmountDecimal,
          inputAmountRaw,
          outputDecimals: eurcBaseTokenDetails.decimals,
          skipRouteCalculation: true,
          toNetwork: Networks.Base,
          toToken: eurcBaseTokenDetails.erc20AddressSourceChain
        },
        type: "evm-to-evm"
      };
    }

    if (isBrlToBrlaBaseDirect(ctx.request.inputCurrency, ctx.request.outputCurrency, ctx.request.to)) {
      const brlaBaseTokenDetails = getOnChainTokenDetails(Networks.Base, EvmToken.BRLA);
      if (!brlaBaseTokenDetails || brlaBaseTokenDetails.type !== "evm") {
        throw new Error("OnRampSquidRouterToBaseEngine: BRLA Base token details not found");
      }

      const inputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal));
      const inputAmountRaw = this.mergeSubsidyRaw(ctx, new Big(nablaSwap.outputAmountRaw)).toFixed(0, 0);

      return {
        data: {
          amountRaw: inputAmountRaw,
          fromNetwork: Networks.Base,
          fromToken: brlaBaseTokenDetails.erc20AddressSourceChain,
          inputAmountDecimal,
          inputAmountRaw,
          outputDecimals: brlaBaseTokenDetails.decimals,
          skipRouteCalculation: true,
          toNetwork: Networks.Base,
          toToken: brlaBaseTokenDetails.erc20AddressSourceChain
        },
        type: "evm-to-evm"
      };
    }

    const usdFeesDistributedDecimal = Big(usdFees.network).plus(usdFees.vortex).plus(usdFees.partnerMarkup);
    const usdFeesDistributedRaw = multiplyByPowerOfTen(usdFeesDistributedDecimal, nablaSwap.outputDecimals);

    const inputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal)).minus(usdFeesDistributedDecimal);
    const inputAmountRaw = this.mergeSubsidyRaw(ctx, new Big(nablaSwap.outputAmountRaw))
      .minus(usdFeesDistributedRaw)
      .toFixed(0, 0);

    const usdcBaseTokenDetails = getTokenDetailsForEvmDestination(EvmToken.USDC, Networks.Base);

    // Trivial case: nabla output (USDC on Base) is already the requested output or is Morpho Vault.
    // Skip the Squid route fetch but still emit bridge meta so downstream stages have a 1:1 passthrough record.
    if (
      ctx.to === Networks.Base &&
      (ctx.request.outputCurrency === EvmToken.USDC || ctx.request.outputCurrency === EvmToken.MORPHO_VAULT)
    ) {
      const targetTokenDetails = getTokenDetailsForEvmDestination(ctx.request.outputCurrency as OnChainToken, Networks.Base);
      return {
        data: {
          amountRaw: inputAmountRaw,
          fromNetwork: Networks.Base,
          fromToken: usdcBaseTokenDetails.erc20AddressSourceChain,
          inputAmountDecimal,
          inputAmountRaw,
          outputDecimals: targetTokenDetails.decimals,
          skipRouteCalculation: true,
          toNetwork: Networks.Base,
          toToken: targetTokenDetails.erc20AddressSourceChain
        },
        type: "evm-to-evm"
      };
    }

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new APIError({
        message: `Invalid network for destination: ${req.to} `,
        status: httpStatus.BAD_REQUEST
      });
    }

    const toToken = getBridgeTargetTokenDetails(req.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

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
