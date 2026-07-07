import { EvmToken, FiatToken, getOnChainTokenDetails, multiplyByPowerOfTen, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { resolveMykoboDepositFee } from "../mykobo-fee";
import { BaseInitializeEngine } from "./index";

export class OnRampInitializeMykoboEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampInitializeMykoboEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    const eurcBaseDetails = getOnChainTokenDetails(Networks.Base, EvmToken.EURC);
    if (!eurcBaseDetails) {
      throw new Error("OnRampInitializeMykoboEngine: EURC token details not found for Base");
    }

    const inputAmountDecimal = new Big(req.inputAmount);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, eurcBaseDetails.decimals).toFixed(0, 0);

    const mykoboFeeTotal = await resolveMykoboDepositFee(inputAmountDecimal.toFixed(2, 0));
    const mykoboFeeDecimal = new Big(mykoboFeeTotal);

    const deliveredEurcDecimal = inputAmountDecimal.minus(mykoboFeeDecimal);
    if (deliveredEurcDecimal.lte(0)) {
      throw new Error(
        `OnRampInitializeMykoboEngine: Mykobo deposit fee ${mykoboFeeDecimal.toFixed()} EUR is greater than or equal to input amount ${inputAmountDecimal.toFixed()} EUR`
      );
    }
    const deliveredEurcRaw = multiplyByPowerOfTen(deliveredEurcDecimal, eurcBaseDetails.decimals).toFixed(0, 0);

    ctx.mykoboMint = {
      currency: FiatToken.EURC,
      fee: mykoboFeeDecimal,
      inputAmountDecimal,
      inputAmountRaw,
      outputAmountDecimal: deliveredEurcDecimal,
      outputAmountRaw: deliveredEurcRaw
    };

    ctx.addNote?.(
      `Assuming ${deliveredEurcDecimal.toFixed()} EURC delivered on Base ephemeral after ${mykoboFeeDecimal.toFixed()} EUR Mykobo deposit fee`
    );
  }
}
