import {
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isNetworkEVM,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampCurrency
} from "@vortexfi/shared";
import Big from "big.js";
import { calculateEvmBridgeAndNetworkFee, getBridgeTargetTokenDetails } from "../../../core/squidrouter";
import { resolveMykoboDepositFee } from "../../../engines/mykobo-fee";
import { calculateFees } from "../../core/fees";
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
  const mykoboFeeDecimal = new Big(await resolveMykoboDepositFee(inputAmountDecimal.toFixed(2, 0)));

  const deliveredEurcDecimal = inputAmountDecimal.minus(mykoboFeeDecimal);
  if (deliveredEurcDecimal.lte(0)) {
    throw new Error(
      `MykoboMint: Mykobo deposit fee ${mykoboFeeDecimal.toFixed()} EUR is greater than or equal to input amount ${inputAmountDecimal.toFixed()} EUR`
    );
  }
  const deliveredEurcRaw = multiplyByPowerOfTen(deliveredEurcDecimal, eurcBaseDetails.decimals).toFixed(0, 0);
  const toNetwork = getNetworkFromDestination(ctx.request.to);
  if (!toNetwork || !isNetworkEVM(toNetwork)) {
    throw new Error(`MykoboMint: Invalid EVM destination ${ctx.request.to}`);
  }
  const toToken = getBridgeTargetTokenDetails(ctx.request.outputCurrency as OnChainToken, toNetwork);
  const isDirectTransfer =
    toNetwork === Networks.Base &&
    (eurcBaseDetails as EvmTokenDetails).erc20AddressSourceChain.toLowerCase() ===
      toToken.erc20AddressSourceChain.toLowerCase();
  const networkFee = isDirectTransfer
    ? "0"
    : (
        await calculateEvmBridgeAndNetworkFee({
          amountRaw: multiplyByPowerOfTen(inputAmountDecimal, eurcBaseDetails.decimals).toFixed(0, 0),
          fromNetwork: Networks.Base as EvmNetworks,
          fromToken: (eurcBaseDetails as EvmTokenDetails).erc20AddressSourceChain,
          originalInputAmountForRateCalc: ctx.request.inputAmount,
          rampType: ctx.request.rampType,
          toNetwork,
          toToken: toToken.erc20AddressSourceChain
        })
      ).networkFeeUSD;
  const fees = await calculateFees(ctx, {
    anchor: { amount: mykoboFeeDecimal.toString(), currency: FiatToken.EURC as RampCurrency },
    network: { amount: networkFee, currency: EvmToken.USDC as RampCurrency }
  });

  ctx.addNote(
    `MykoboMint: ${deliveredEurcDecimal.toFixed()} EURC delivered on Base after ${mykoboFeeDecimal.toFixed()} EUR fee`
  );

  return {
    fees,
    metadata: {
      mint: {
        currency: FiatToken.EURC,
        fee: mykoboFeeDecimal,
        inputAmountDecimal,
        inputAmountRaw: multiplyByPowerOfTen(inputAmountDecimal, eurcBaseDetails.decimals).toFixed(0, 0),
        outputAmountDecimal: deliveredEurcDecimal,
        outputAmountRaw: deliveredEurcRaw
      }
    },
    output: evmIO(EvmToken.EURC, Networks.Base, deliveredEurcDecimal, deliveredEurcRaw)
  };
}
