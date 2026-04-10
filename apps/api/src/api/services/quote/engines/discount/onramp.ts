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
    // Handle both Base USDC flows and Moonbeam axlUSDC flows
    if (!ctx.nablaSwap && !ctx.nablaSwapEvm) {
      throw new Error("OnRampDiscountEngine requires either nablaSwap or nablaSwapEvm to be defined");
    }

    const nablaSwap = ctx.nablaSwap || ctx.nablaSwapEvm;
    if (!nablaSwap?.oraclePrice) {
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

  /**
   * Queries squidrouter to determine the actual conversion rate from USDC on Base
   * to the final destination token on the target EVM chain.
   *
   * The oracle price is based on the Binance USDT-BRL rate, but the Nabla swap on Base
   * outputs USDC (not USDT). Since USDC may trade at a discount to USDT via
   * squidrouter, using the oracle USDT rate as the USDC subsidy target means the user
   * may receive slightly less than the oracle-promised amount after the squidrouter step.
   *
   * This method fetches the actual USDC → destination token rate so the discount engine
   * can back-calculate the precise USDC amount required on Base.
   *
   * @param ctx - The quote context (must have request.outputCurrency and request.to set)
   * @param expectedUSDCDecimal - The oracle-based expected USDC amount used as probe input
   * @returns The conversion rate (destination token units per USDC) or null on failure
   */
  private async getSquidRouterUSDCConversionRate(ctx: QuoteContext, expectedUSDCDecimal: Big): Promise<Big | null> {
    const req = ctx.request;
    const toNetwork = getNetworkFromDestination(req.to);

    if (!toNetwork) {
      return null;
    }

    try {
      const bridgeQuote = await getEvmBridgeQuote({
        amountDecimal: expectedUSDCDecimal.toString(),
        fromNetwork: Networks.Base,
        inputCurrency: EvmToken.USDC as unknown as OnChainToken,
        outputCurrency: req.outputCurrency as OnChainToken,
        rampType: req.rampType,
        toNetwork
      });

      if (expectedUSDCDecimal.lte(0) || bridgeQuote.outputAmountDecimal.lte(0)) {
        return null;
      }

      const conversionRate = bridgeQuote.outputAmountDecimal.div(expectedUSDCDecimal);
      logger.info(
        `OnRampDiscountEngine: SquidRouter USDC→${req.outputCurrency} rate: ${conversionRate.toFixed(6)} ` +
          `(input: ${expectedUSDCDecimal.toFixed(6)} USDC, output: ${bridgeQuote.outputAmountDecimal.toFixed(6)} ${req.outputCurrency})`
      );
      return conversionRate;
    } catch (error) {
      logger.warn(
        `OnRampDiscountEngine: Could not fetch SquidRouter USDC→${req.outputCurrency} conversion rate, ` +
          `falling back to 1:1 assumption. Error: ${error}`
      );
      return null;
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    // Determine which nabla swap we're using (Base EVM or Pendulum)
    const isBaseFlow = !!ctx.nablaSwapEvm;
    const nablaSwap = ctx.nablaSwapEvm || ctx.nablaSwap!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const oraclePrice = nablaSwap.oraclePrice!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const usdFees = ctx.fees!.usd!;

    const { inputAmount, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    // Calculate the oracle-based expected output
    const {
      expectedOutput: oracleExpectedOutputDecimal,
      adjustedDifference,
      adjustedTargetDiscount
    } = calculateExpectedOutput(inputAmount, oraclePrice, targetDiscount, this.config.isOfframp, partner);

    // For onramps to EVM chains (not AssetHub), adjust for the actual bridge conversion rate
    let adjustedExpectedOutputDecimal = oracleExpectedOutputDecimal;
    if (ctx.request.to !== "assethub") {
      const squidRouterRate = isBaseFlow
        ? await this.getSquidRouterUSDCConversionRate(ctx, oracleExpectedOutputDecimal)
        : await this.getSquidRouterAxlUSDCConversionRate(ctx, oracleExpectedOutputDecimal);

      if (squidRouterRate !== null && squidRouterRate.gt(0)) {
        adjustedExpectedOutputDecimal = oracleExpectedOutputDecimal.div(squidRouterRate);
        const tokenName = isBaseFlow ? "USDC" : "axlUSDC";
        ctx.addNote?.(
          `OnRampDiscountEngine: Adjusted expected ${tokenName} from ${oracleExpectedOutputDecimal.toFixed(6)} ` +
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
