import {
  AveniaPaymentMethod,
  BlockchainSendMethod,
  BrlaApiService,
  BrlaCurrency,
  EvmToken,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  multiplyByPowerOfTen,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { evmIO } from "../../core/io";
import type { PhaseCtx, PhaseIO } from "../../core/types";

export async function simulateAveniaMint(
  input: PhaseIO<typeof FiatToken.BRL, "fiat">,
  ctx: PhaseCtx
): Promise<PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>> {
  const brlaTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
  const inputAmountDecimal = new Big(input.amount);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, brlaTokenDetails.decimals).toFixed(0, 0);

  const brlaApiService = BrlaApiService.getInstance();
  const aveniaPayInToInternalQuote = await brlaApiService.createPayInQuote(
    {
      inputAmount: inputAmountDecimal.toString(),
      inputCurrency: BrlaCurrency.BRL,
      inputPaymentMethod: AveniaPaymentMethod.PIX,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      outputThirdParty: false
    },
    { useCache: true }
  );

  const aveniaTransferQuote = await brlaApiService.createPayInQuote(
    {
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputAmount: aveniaPayInToInternalQuote.outputAmount.toString(),
      inputCurrency: BrlaCurrency.BRLA,
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.MOONBEAM,
      outputThirdParty: false
    },
    { useCache: true }
  );

  const gasFeePayIn = aveniaPayInToInternalQuote.appliedFees.find(fee => fee.type === "Gas Fee");
  const receivedBrlaDecimal = new Big(aveniaPayInToInternalQuote.outputAmount).minus(gasFeePayIn?.amount || 0);
  const receivedBrlaRaw = multiplyByPowerOfTen(receivedBrlaDecimal, brlaTokenDetails.decimals).toFixed(0, 0);

  const gasFeeTransfer = aveniaTransferQuote.appliedFees.find(fee => fee.type === "Gas Fee");
  let gasFeeBuffer = new Big(0.1);
  if (gasFeePayIn || gasFeeTransfer) {
    const gasFeeAmount = new Big(gasFeePayIn?.amount || 0).plus(gasFeeTransfer?.amount || 0);
    gasFeeBuffer = gasFeeAmount.mul(0.5);
  }

  const mintedBrlaDecimal = new Big(aveniaTransferQuote.outputAmount).minus(gasFeeBuffer);
  const mintedBrlaRaw = multiplyByPowerOfTen(mintedBrlaDecimal, brlaTokenDetails.decimals).toFixed(0, 0);
  const transferFee = receivedBrlaDecimal.minus(mintedBrlaDecimal);

  ctx.addNote(`AveniaMint: assuming ${mintedBrlaDecimal.toFixed()} BRLA minted on the Base ephemeral account`);

  return evmIO(EvmToken.BRLA, Networks.Base, mintedBrlaDecimal, mintedBrlaRaw, {
    ...input.meta,
    aveniaMint: {
      currency: FiatToken.BRL,
      fee: inputAmountDecimal.minus(aveniaPayInToInternalQuote.outputAmount),
      inputAmountDecimal,
      inputAmountRaw,
      outputAmountDecimal: receivedBrlaDecimal,
      outputAmountRaw: receivedBrlaRaw
    },
    aveniaTransfer: {
      currency: FiatToken.BRL,
      fee: transferFee,
      inputAmountDecimal: receivedBrlaDecimal,
      inputAmountRaw: receivedBrlaRaw,
      outputAmountDecimal: mintedBrlaDecimal,
      outputAmountRaw: mintedBrlaRaw
    },
    fees: ctx.fees
  });
}
