import { EvmToken, getOnChainTokenDetails, Networks, RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import { QuoteContext } from "../../core/types";
import { isEurToEurcBaseDirect } from "../../utils";
import { BaseNablaSwapEngineEvm, NablaSwapEvmComputation } from "./base-evm";

export class OnRampSwapEngineMykoboEvm extends BaseNablaSwapEngineEvm {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSwapEngineMykoboEvm: Skipped because rampType is SELL, this engine handles BUY operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.fees?.usd) {
      throw new Error("OnRampSwapEngineMykoboEvm: Fees in USD must be calculated first - ensure fee stage ran successfully");
    }
    if (!ctx.mykoboMint) {
      throw new Error(
        "OnRampSwapEngineMykoboEvm: Missing mykoboMint quote data from previous stage - ensure initialize stage ran successfully"
      );
    }
  }

  async execute(ctx: QuoteContext): Promise<void> {
    if (ctx.request.rampType !== RampDirection.BUY) {
      ctx.addNote?.(this.config.skipNote);
      return;
    }

    this.validate(ctx);

    if (isEurToEurcBaseDirect(ctx.request.inputCurrency, ctx.request.outputCurrency, ctx.request.to)) {
      // biome-ignore lint/style/noNonNullAssertion: validated above
      const inputAmountPreFees = ctx.mykoboMint!.outputAmountDecimal;
      const eurcTokenDetails = getOnChainTokenDetails(Networks.Base, EvmToken.EURC);
      if (!eurcTokenDetails || eurcTokenDetails.type !== "evm") {
        throw new Error("OnRampSwapEngineMykoboEvm: EURC token details not found for Base");
      }

      const inputAmountForSwapRaw = inputAmountPreFees.times(new Big(10).pow(eurcTokenDetails.decimals)).toFixed(0, 0);
      ctx.nablaSwapEvm = {
        effectiveExchangeRate: "1",
        inputAmountForSwapDecimal: inputAmountPreFees.toString(),
        inputAmountForSwapRaw,
        inputCurrency: EvmToken.EURC,
        inputDecimals: eurcTokenDetails.decimals,
        inputToken: eurcTokenDetails.erc20AddressSourceChain,
        outputAmountDecimal: inputAmountPreFees,
        outputAmountRaw: inputAmountForSwapRaw,
        outputCurrency: EvmToken.EURC,
        outputDecimals: eurcTokenDetails.decimals,
        outputToken: eurcTokenDetails.erc20AddressSourceChain
      };
      ctx.addNote?.(`Nabla swap bypassed for EUR→EURC on Base, passthrough amount ${inputAmountPreFees.toFixed()} EURC (1:1)`);
      return;
    }

    await super.execute(ctx);
  }

  protected compute(ctx: QuoteContext): NablaSwapEvmComputation {
    // biome-ignore lint/style/noNonNullAssertion: validated above
    const inputAmountPreFees = ctx.mykoboMint!.outputAmountDecimal;

    return {
      inputAmountPreFees,
      inputToken: EvmToken.EURC,
      outputToken: EvmToken.USDC
    };
  }
}
