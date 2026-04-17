import {
  EvmToken,
  getNetworkFromDestination,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import { getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseDiscountEngine, DiscountComputation } from ".";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "./helpers";

export class OnRampDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.BUY,
    isOfframp: false,
    skipNote: "Skipped for off-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OnRampDiscountEngine requires nablaSwap to be defined");
    }

    if (!ctx.nablaSwap.oraclePrice) {
      throw new Error("OnRampDiscountEngine requires nablaSwap.oraclePrice to be defined");
    }

    if (!ctx.request.inputAmount) {
      throw new Error("OnRampDiscountEngine requires request.inputAmount to be defined");
    }

    if (!ctx.fees?.usd) {
      throw new Error("OnRampDiscountEngine requires fees.usd to be defined");
    }
  }

  /**
   * Queries squidrouter to determine the actual conversion rate from axlUSDC on Moonbeam
   * to the final destination token on the target EVM chain.
   *
   * The oracle price is based on the Binance USDT-BRL rate, but the Nabla swap on Pendulum
   * outputs axlUSDC (not USDT). Since axlUSDC may trade at a discount to USDT via
   * squidrouter, using the oracle USDT rate as the axlUSDC subsidy target means the user
   * would receive slightly less than the oracle-promised amount after the squidrouter step.
   *
   * This method fetches the actual axlUSDC → destination token rate so the discount engine
   * can back-calculate the precise axlUSDC amount required on Pendulum.
   *
   * @param ctx - The quote context (must have request.outputCurrency and request.to set)
   * @param expectedAxlUSDCDecimal - The oracle-based expected axlUSDC amount used as probe input
   * @returns The conversion rate (destination token units per axlUSDC) or null on failure
   */
  private async getSquidRouterAxlUSDCConversionRate(ctx: QuoteContext, expectedAxlUSDCDecimal: Big): Promise<Big | null> {
    const req = ctx.request;
    const toNetwork = getNetworkFromDestination(req.to);

    if (!toNetwork) {
      return null;
    }

    try {
      const bridgeQuote = await getEvmBridgeQuote({
        amountDecimal: expectedAxlUSDCDecimal.toString(),
        fromNetwork: Networks.Moonbeam,
        inputCurrency: EvmToken.AXLUSDC as unknown as OnChainToken,
        outputCurrency: req.outputCurrency as OnChainToken,
        rampType: req.rampType,
        toNetwork
      });

      if (expectedAxlUSDCDecimal.lte(0) || bridgeQuote.outputAmountDecimal.lte(0)) {
        return null;
      }

      const conversionRate = bridgeQuote.outputAmountDecimal.div(expectedAxlUSDCDecimal);
      logger.info(
        `OnRampDiscountEngine: SquidRouter axlUSDC→${req.outputCurrency} rate: ${conversionRate.toFixed(6)} ` +
          `(input: ${expectedAxlUSDCDecimal.toFixed(6)} axlUSDC, output: ${bridgeQuote.outputAmountDecimal.toFixed(6)} ${req.outputCurrency})`
      );
      return conversionRate;
    } catch (error) {
      logger.warn(
        `OnRampDiscountEngine: Could not fetch SquidRouter axlUSDC→${req.outputCurrency} conversion rate, ` +
          `falling back to 1:1 assumption. Error: ${error}`
      );
      return null;
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const oraclePrice = nablaSwap.oraclePrice!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const usdFees = ctx.fees!.usd!;

    const { inputAmount, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    // Calculate the oracle-based expected output in USDT-equivalent axlUSDC terms.
    const {
      expectedOutput: oracleExpectedOutputDecimal,
      adjustedDifference,
      adjustedTargetDiscount
    } = calculateExpectedOutput(inputAmount, oraclePrice, targetDiscount, this.config.isOfframp, partner);

    // For onramps to EVM chains (not AssetHub), the Nabla output token (axlUSDC on
    // Pendulum) is subsequently bridged via squidrouter (Moonbeam → EVM destination). The
    // oracle gives a USDT-BRL rate, but axlUSDC may not trade 1:1 with USDT on squidrouter.
    // So we use the actual squidrouter route to determine the required axlUSDC amount
    let adjustedExpectedOutputDecimal = oracleExpectedOutputDecimal;
    if (ctx.request.to !== "assethub") {
      const squidRouterRate = await this.getSquidRouterAxlUSDCConversionRate(ctx, oracleExpectedOutputDecimal);

      if (squidRouterRate !== null && squidRouterRate.gt(0)) {
        adjustedExpectedOutputDecimal = oracleExpectedOutputDecimal.div(squidRouterRate);
        ctx.addNote?.(
          `OnRampDiscountEngine: Adjusted expected axlUSDC from ${oracleExpectedOutputDecimal.toFixed(6)} ` +
            `to ${adjustedExpectedOutputDecimal.toFixed(6)} (squidRouter rate: ${squidRouterRate.toFixed(6)})`
        );
      }
    }

    const expectedOutputAmountRaw = multiplyByPowerOfTen(adjustedExpectedOutputDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // For onramps, fees are deducted from the nabla output (not before the swap)
    const deductedFeesAfterSwap = Big(usdFees.network).plus(usdFees.vortex).plus(usdFees.partnerMarkup);
    const actualOutputAmountDecimal = nablaSwap.outputAmountDecimal.minus(deductedFeesAfterSwap);
    const actualOutputAmountRaw = multiplyByPowerOfTen(actualOutputAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // Calculate ideal subsidy (uncapped - the full shortfall needed to reach adjusted expected output)
    const idealSubsidyAmountDecimal = actualOutputAmountDecimal.gte(adjustedExpectedOutputDecimal)
      ? new Big(0)
      : adjustedExpectedOutputDecimal.minus(actualOutputAmountDecimal);
    const idealSubsidyAmountRaw = multiplyByPowerOfTen(idealSubsidyAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // Calculate actual subsidy (capped by maxSubsidy)
    const actualSubsidyAmountDecimal =
      targetDiscount > 0
        ? calculateSubsidyAmount(adjustedExpectedOutputDecimal, actualOutputAmountDecimal, maxSubsidy)
        : Big(0);
    const actualSubsidyAmountRaw = multiplyByPowerOfTen(actualSubsidyAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    const targetOutputAmountDecimal = actualOutputAmountDecimal.plus(actualSubsidyAmountDecimal);
    const targetOutputAmountRaw = Big(actualOutputAmountRaw).plus(actualSubsidyAmountRaw).toFixed(0, 0);

    const subsidyRate = adjustedExpectedOutputDecimal.gt(0)
      ? actualSubsidyAmountDecimal.div(adjustedExpectedOutputDecimal)
      : new Big(0);

    console.log("subsidyRate: ", subsidyRate);

    return {
      actualOutputAmountDecimal,
      actualOutputAmountRaw,
      adjustedDifference,
      adjustedTargetDiscount,
      expectedOutputAmountDecimal: adjustedExpectedOutputDecimal,
      expectedOutputAmountRaw,
      idealSubsidyAmountInOutputTokenDecimal: idealSubsidyAmountDecimal,
      idealSubsidyAmountInOutputTokenRaw: idealSubsidyAmountRaw,
      partnerId: partner ? partner.id : null,
      subsidyAmountInOutputTokenDecimal: actualSubsidyAmountDecimal,
      subsidyAmountInOutputTokenRaw: actualSubsidyAmountRaw,
      subsidyRate,
      targetOutputAmountDecimal,
      targetOutputAmountRaw
    };
  }
}
