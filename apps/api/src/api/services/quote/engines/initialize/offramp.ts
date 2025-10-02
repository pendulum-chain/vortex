import {
  EvmToken,
  getNetworkFromDestination,
  getPendulumDetails,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { calculatePreNablaDeductibleFees } from "../../core/quote-fees";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OffRampInitializeEngine implements Stage {
  readonly key = StageKey.OffRampInitialize;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("OffRampInputPlannerEngine: skipped for on-ramp request");
      return;
    }

    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      req.inputAmount,
      req.inputCurrency,
      req.outputCurrency,
      req.rampType,
      req.from,
      req.to,
      ctx.partner?.id || undefined
    );

    const fromNetwork = getNetworkFromDestination(req.from);
    if (!fromNetwork) {
      throw new APIError({ message: `Invalid source network: ${req.from}`, status: httpStatus.BAD_REQUEST });
    }

    const representativeCurrency = getPendulumDetails(req.inputCurrency, fromNetwork).currency;

    ctx.preNabla = {
      deductibleFeeAmount: new Big(preNablaDeductibleFeeAmount),
      feeCurrency,
      representativeInputCurrency: representativeCurrency
    };

    if (req.from !== Networks.AssetHub) {
      const quoteRequest: EvmBridgeQuoteRequest = {
        amountDecimal: req.inputAmount,
        fromNetwork: req.from as Networks,
        inputCurrency: req.inputCurrency as OnChainToken,
        outputCurrency: EvmToken.AXLUSDC as unknown as OnChainToken,
        rampType: req.rampType,
        toNetwork: Networks.Moonbeam
      };
      const bridgeQuote = await getEvmBridgeQuote(quoteRequest);

      ctx.evmToPendulum = {
        ...quoteRequest,
        fromToken: bridgeQuote.fromToken,
        inputAmountDecimal: Big(quoteRequest.amountDecimal),
        inputAmountRaw: bridgeQuote.inputAmountRaw,
        networkFeeUSD: bridgeQuote.networkFeeUSD,
        outputAmountDecimal: bridgeQuote.outputAmountDecimal,
        outputAmountRaw: bridgeQuote.outputAmountRaw,
        toToken: bridgeQuote.toToken
      };
    } else {
      ctx.assethubToPendulumXcm = {
        fromToken: "",
        inputAmountDecimal: undefined,
        inputAmountRaw: "",
        outputAmountDecimal: undefined,
        outputAmountRaw: "",
        toToken: "",
        xcmFees: undefined
      };
    }

    ctx.addNote?.(
      `OffRampInputPlannerEngine: fee=${preNablaDeductibleFeeAmount.toString()} ${feeCurrency}, rep=${representativeCurrency}, inputForSwap=${inputAmountForSwap.toString()}`
    );
  }
}
