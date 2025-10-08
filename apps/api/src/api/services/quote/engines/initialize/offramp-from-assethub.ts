import {
  EvmToken,
  getNetworkFromDestination,
  getPendulumDetails,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { calculatePreNablaDeductibleFees } from "../../core/quote-fees";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OffRampFromAssethubInitializeEngine implements Stage {
  readonly key = StageKey.Initialize;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for on-ramp request");
      return;
    }

    const { preNablaDeductibleFeeAmount: deductibleFeeAmountInFeeCurrency, feeCurrency } =
      await calculatePreNablaDeductibleFees(
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
    const deductibleFeeAmountInSwapCurrency = await this.price.convertCurrency(
      deductibleFeeAmountInFeeCurrency.toString(),
      feeCurrency,
      representativeCurrency
    );

    ctx.preNabla = {
      deductibleFeeAmountInFeeCurrency,
      deductibleFeeAmountInSwapCurrency: new Big(deductibleFeeAmountInSwapCurrency),
      feeCurrency,
      representativeInputCurrency: representativeCurrency
    };

    const fromToken = req.inputCurrency as OnChainToken;
    const fromTokenDecimals = getPendulumDetails(fromToken, Networks.AssetHub).decimals;
    const inputAmountDecimal = new Big(req.inputAmount);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, fromTokenDecimals).toFixed(0);

    // TODO estimate XCM fees for AssetHub to Pendulum XCM transfer
    const xcmFees = {
      destination: {
        amount: "0.01",
        amountRaw: "10000",
        currency: "USDC"
      },
      origin: {
        amount: "0.01",
        amountRaw: "10000",
        currency: "USDC"
      }
    };

    // Calculate gross output after subtracting XCM fees
    const originFeeInTargetCurrency = await this.price.convertCurrency(
      xcmFees.origin.amount,
      xcmFees.origin.currency as RampCurrency,
      req.inputCurrency
    );
    const destinationFeeInTargetCurrency = await this.price.convertCurrency(
      xcmFees.destination.amount,
      xcmFees.destination.currency as RampCurrency,
      req.inputCurrency
    );
    const outputAmountDecimal = inputAmountDecimal.minus(originFeeInTargetCurrency).minus(destinationFeeInTargetCurrency);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, fromTokenDecimals).toFixed(0);

    ctx.assethubToPendulumXcm = {
      fromToken,
      inputAmountDecimal,
      inputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw,
      toToken: fromToken, // Input and output token are the same for XCM transfer
      xcmFees
    };

    ctx.addNote?.(
      `Initialized: input=${inputAmountDecimal.toString()} ${fromToken}, raw=${inputAmountRaw}, output=${outputAmountDecimal.toString()} ${fromToken}, raw=${outputAmountRaw}`
    );
  }
}
