import {
  EvmToken,
  FiatToken,
  getOnChainTokenDetails,
  MykoboApiService,
  multiplyByPowerOfTen,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { evmIO } from "../../core/io";
import { defineContext } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import type { AnchorOperationMetadata } from "../avenia-mint/simulation";

export interface MykoboMintMetadata {
  mint: AnchorOperationMetadata;
}

export const MykoboMintContext = defineContext<MykoboMintMetadata>()("mykoboMint");

export async function simulateMykoboMint(
  input: PhaseIO<typeof FiatToken.EURC, "fiat">,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>, MykoboMintMetadata>> {
  const eurcBaseDetails = getOnChainTokenDetails(Networks.Base, EvmToken.EURC);
  if (!eurcBaseDetails) {
    throw new Error("MykoboMint: EURC token details not found for Base");
  }

  const inputAmountDecimal = new Big(input.amount);
  const mykoboFeeResponse = await MykoboApiService.getInstance().defaultDepositFee(inputAmountDecimal.toFixed(2, 0));
  const mykoboFeeDecimal = new Big(mykoboFeeResponse.total);

  const deliveredEurcDecimal = inputAmountDecimal.minus(mykoboFeeDecimal);
  if (deliveredEurcDecimal.lte(0)) {
    throw new Error(
      `MykoboMint: Mykobo deposit fee ${mykoboFeeDecimal.toFixed()} EUR is greater than or equal to input amount ${inputAmountDecimal.toFixed()} EUR`
    );
  }
  const deliveredEurcRaw = multiplyByPowerOfTen(deliveredEurcDecimal, eurcBaseDetails.decimals).toFixed(0, 0);

  ctx.addNote(
    `MykoboMint: ${deliveredEurcDecimal.toFixed()} EURC delivered on Base after ${mykoboFeeDecimal.toFixed()} EUR fee`
  );

  return {
    metadata: {
      mint: {
        currency: FiatToken.EURC,
        fee: mykoboFeeDecimal,
        inputAmountDecimal,
        inputAmountRaw: input.amountRaw,
        outputAmountDecimal: deliveredEurcDecimal,
        outputAmountRaw: deliveredEurcRaw
      }
    },
    output: evmIO(EvmToken.EURC, Networks.Base, deliveredEurcDecimal, deliveredEurcRaw)
  };
}
