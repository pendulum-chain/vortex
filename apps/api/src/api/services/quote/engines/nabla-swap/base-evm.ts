import { EvmToken, EvmTokenDetails, getOnChainTokenDetails, Networks, RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import logger from "../../../../../config/logger";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateNablaSwapOutputEvm } from "../../core/nabla";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface NablaSwapEvmConfig {
  direction: RampDirection;
  skipNote: string;
}

export interface NablaSwapEvmComputation {
  oraclePrice?: Big;
  inputAmountPreFees: Big;
  inputToken: EvmToken;
  outputToken: EvmToken;
}

export abstract class BaseNablaSwapEngineEvm implements Stage {
  abstract readonly config: NablaSwapEvmConfig;

  readonly key = StageKey.NablaSwap;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    this.validate(ctx);

    const { inputAmountPreFees, inputToken, outputToken } = this.compute(ctx);

    // Get token details for Base network
    const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inputToken) as EvmTokenDetails;
    const outputTokenDetails = getOnChainTokenDetails(Networks.Base, outputToken) as EvmTokenDetails;

    if (!inputTokenDetails || !outputTokenDetails) {
      throw new Error("BaseNablaSwapEngineEvm: Could not find EVM token details for the requested tokens");
    }

    const deductibleFeeAmount = this.getDeductibleFeeAmount(ctx);
    const inputAmountForSwap = inputAmountPreFees.minus(deductibleFeeAmount).toString();
    const inputAmountForSwapRaw = this.calculateInputAmountForSwapRaw(inputAmountForSwap, inputTokenDetails);

    const result = await calculateNablaSwapOutputEvm({
      inputAmountForSwap,
      inputTokenDetails,
      outputTokenDetails,
      rampType: request.rampType
    });

    let oraclePrice;
    try {
      oraclePrice = await priceFeedService.getOnchainOraclePrice(
        request.rampType === RampDirection.BUY ? request.inputCurrency : request.outputCurrency
      );
    } catch (error) {
      logger.warn(
        `BaseNablaSwapEngineEvm: Unable to fetch on-chain oracle price for ${request.outputCurrency}, proceeding without it. Error: ${error}`
      );
    }

    this.assignNablaSwapContext(
      ctx,
      result,
      inputAmountForSwap,
      inputAmountForSwapRaw,
      inputToken,
      outputToken,
      inputTokenDetails,
      outputTokenDetails,
      oraclePrice?.price
    );

    this.addNote(ctx, inputTokenDetails, outputTokenDetails, inputAmountForSwap, result);
  }

  protected abstract validate(ctx: QuoteContext): void;

  protected abstract compute(ctx: QuoteContext): NablaSwapEvmComputation;

  protected getDeductibleFeeAmount(ctx: QuoteContext): Big {
    if (ctx.request.rampType === RampDirection.SELL) {
      return ctx.preNabla?.deductibleFeeAmountInSwapCurrency || new Big(0);
    } else {
      // For onramps, the fees are deducted after the nabla swap, so no deductible fee before the swap
      return new Big(0);
    }
  }

  protected calculateInputAmountForSwapRaw(inputAmountForSwap: string, inputToken: EvmTokenDetails): string {
    return new Big(inputAmountForSwap).times(new Big(10).pow(inputToken.decimals)).toFixed(0);
  }

  private assignNablaSwapContext(
    ctx: QuoteContext,
    result: { effectiveExchangeRate?: string; nablaOutputAmountDecimal: Big; nablaOutputAmountRaw: string },
    inputAmountForSwapDecimal: string,
    inputAmountForSwapRaw: string,
    inputToken: EvmToken,
    outputToken: EvmToken,
    inputTokenDetails: EvmTokenDetails,
    outputTokenDetails: EvmTokenDetails,
    oraclePrice?: Big
  ): void {
    ctx.nablaSwapEvm = {
      ...ctx.nablaSwapEvm,
      effectiveExchangeRate: result.effectiveExchangeRate,
      inputAmountForSwapDecimal,
      inputAmountForSwapRaw,
      inputCurrency: inputToken,
      inputDecimals: inputTokenDetails.decimals,
      inputToken: inputTokenDetails.erc20AddressSourceChain,
      oraclePrice,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: outputToken,
      outputDecimals: outputTokenDetails.decimals,
      outputToken: outputTokenDetails.erc20AddressSourceChain
    };
  }

  private addNote(
    ctx: QuoteContext,
    inputToken: EvmTokenDetails,
    outputToken: EvmTokenDetails,
    inputAmountForSwap: string,
    result: { nablaOutputAmountDecimal: Big }
  ): void {
    ctx.addNote?.(
      `Nabla swap from ${inputToken.assetSymbol} to ${outputToken.assetSymbol}, input amount ${inputAmountForSwap}, output amount ${result.nablaOutputAmountDecimal.toFixed()}`
    );
  }
}
