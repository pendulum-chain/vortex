import { EvmToken, getOnChainTokenDetails, Networks, RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import { QuoteContext } from "../../core/types";
import { isBrlToBrlaBaseDirect } from "../../utils";
import { BaseNablaSwapEngineEvm, NablaSwapEvmComputation } from "./base-evm";

export class OnRampSwapEngineEvm extends BaseNablaSwapEngineEvm {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSwapEngineEvm: Skipped because rampType is SELL, this engine handles BUY operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.fees?.usd) {
      throw new Error("OnRampSwapEngineEvm: Fees in USD must be calculated first - ensure fee stage ran successfully");
    }
  }

  async execute(ctx: QuoteContext): Promise<void> {
    if (ctx.request.rampType !== RampDirection.BUY) {
      ctx.addNote?.(this.config.skipNote);
      return;
    }

    this.validate(ctx);

    if (isBrlToBrlaBaseDirect(ctx.request.inputCurrency, ctx.request.outputCurrency, ctx.request.to)) {
      if (!ctx.aveniaTransfer) {
        throw new Error(
          "OnRampSwapEngineEvm: Missing aveniaTransfer quote data from previous stage - ensure initialize stage ran successfully"
        );
      }
      const inputAmountPreFees = ctx.aveniaTransfer.outputAmountDecimal;
      const brlaTokenDetails = getOnChainTokenDetails(Networks.Base, EvmToken.BRLA);
      if (!brlaTokenDetails || brlaTokenDetails.type !== "evm") {
        throw new Error("OnRampSwapEngineEvm: BRLA token details not found for Base");
      }

      const inputAmountForSwapRaw = inputAmountPreFees.times(new Big(10).pow(brlaTokenDetails.decimals)).toFixed(0, 0);
      ctx.nablaSwapEvm = {
        ammOutputAmountDecimal: inputAmountPreFees,
        ammOutputAmountRaw: inputAmountForSwapRaw,
        effectiveExchangeRate: "1",
        inputAmountForSwapDecimal: inputAmountPreFees.toString(),
        inputAmountForSwapRaw,
        inputCurrency: EvmToken.BRLA,
        inputDecimals: brlaTokenDetails.decimals,
        inputToken: brlaTokenDetails.erc20AddressSourceChain,
        outputAmountDecimal: inputAmountPreFees,
        outputAmountRaw: inputAmountForSwapRaw,
        outputCurrency: EvmToken.BRLA,
        outputDecimals: brlaTokenDetails.decimals,
        outputToken: brlaTokenDetails.erc20AddressSourceChain
      };
      ctx.addNote?.(`Nabla swap bypassed for BRL→BRLA on Base, passthrough amount ${inputAmountPreFees.toFixed()} BRLA (1:1)`);
      return;
    }

    await super.execute(ctx);
  }

  protected compute(ctx: QuoteContext): NablaSwapEvmComputation {
    if (!ctx.aveniaTransfer) {
      throw new Error(
        "OnRampSwapEngineEvm: Missing aveniaTransfer quote data from previous stage - ensure initialize stage ran successfully"
      );
    }

    const inputAmountPreFees = ctx.aveniaTransfer.outputAmountDecimal;

    // For Onramp EVM, the input token for Nabla is the output of Avenia transfer (BRLA on Base)
    // The output token is fixed at USDC.
    const inputToken = EvmToken.BRLA;
    const outputToken = EvmToken.USDC;

    return {
      inputAmountPreFees,
      inputToken,
      outputToken
    };
  }
}
