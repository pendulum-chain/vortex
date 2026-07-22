import {
  EvmNetworks,
  EvmToken,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { getEvmBridgeQuote } from "../../../core/squidrouter";
import { evmIO } from "../../core/io";
import { defineContext, SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface EvmOfframpSourceMetadata {
  fromNetwork: EvmNetworks;
  fromToken: string;
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  network: typeof Networks.Base;
  networkFeeUSD: string;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  toNetwork: typeof Networks.Base;
  toToken: string;
  token: typeof EvmToken.USDC;
}

export const EvmOfframpSourceContext = defineContext<EvmOfframpSourceMetadata>()("evmOfframpSource");

export async function simulateEvmOfframpSource<FromToken extends OnChainToken, FromNetwork extends EvmNetworks>(
  input: PhaseIO<FromToken, FromNetwork>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>, EvmOfframpSourceMetadata>> {
  if (input.chain === Networks.Base && input.token === EvmToken.USDC) {
    const tokenDetails = getOnChainTokenDetails(Networks.Base, EvmToken.USDC);
    if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
      throw new Error("EvmOfframpSource: Missing Base USDC token details");
    }
    if (!ctx.fees?.usd || !ctx.fees.displayFiat) {
      throw new Error("EvmOfframpSource: Missing fee snapshot");
    }
    ctx.addNote(`EvmOfframpSource: direct ${input.amount.toFixed()} USDC transfer on Base`);
    return {
      fees: ctx.fees,
      metadata: {
        fromNetwork: Networks.Base,
        fromToken: tokenDetails.erc20AddressSourceChain,
        inputAmountDecimal: input.amount,
        inputAmountRaw: input.amountRaw,
        network: Networks.Base,
        networkFeeUSD: "0",
        outputAmountDecimal: input.amount,
        outputAmountRaw: input.amountRaw,
        token: EvmToken.USDC,
        toNetwork: Networks.Base,
        toToken: tokenDetails.erc20AddressSourceChain
      },
      output: evmIO(EvmToken.USDC, Networks.Base, input.amount, input.amountRaw)
    };
  }

  const bridgeQuote = await getEvmBridgeQuote({
    amountDecimal: input.amount.toString(),
    fromNetwork: input.chain,
    inputCurrency: input.token,
    outputCurrency: EvmToken.USDC,
    rampType: RampDirection.SELL,
    toNetwork: Networks.Base
  });
  if (!ctx.fees?.usd || !ctx.fees.displayFiat) {
    throw new Error("EvmOfframpSource: Missing fee snapshot");
  }
  const networkFeeDisplay = await priceFeedService.convertCurrency(
    bridgeQuote.networkFeeUSD,
    EvmToken.USDC,
    ctx.fees.displayFiat.currency
  );
  const fees = {
    displayFiat: {
      ...ctx.fees.displayFiat,
      network: networkFeeDisplay,
      total: new Big(ctx.fees.displayFiat.anchor)
        .plus(networkFeeDisplay)
        .plus(ctx.fees.displayFiat.partnerMarkup)
        .plus(ctx.fees.displayFiat.vortex)
        .toFixed(2)
    },
    usd: {
      ...ctx.fees.usd,
      network: bridgeQuote.networkFeeUSD,
      total: new Big(ctx.fees.usd.anchor)
        .plus(bridgeQuote.networkFeeUSD)
        .plus(ctx.fees.usd.partnerMarkup)
        .plus(ctx.fees.usd.vortex)
        .toFixed(6)
    }
  };
  ctx.addNote(
    `EvmOfframpSource: ${input.amount.toFixed()} ${input.token} on ${input.chain} -> ${bridgeQuote.outputAmountDecimal.toFixed()} USDC on Base`
  );
  return {
    fees,
    metadata: {
      fromNetwork: input.chain,
      fromToken: bridgeQuote.fromToken,
      inputAmountDecimal: new Big(input.amount),
      inputAmountRaw: bridgeQuote.inputAmountRaw,
      network: Networks.Base,
      networkFeeUSD: bridgeQuote.networkFeeUSD,
      outputAmountDecimal: bridgeQuote.outputAmountDecimal,
      outputAmountRaw: bridgeQuote.outputAmountRaw,
      token: EvmToken.USDC,
      toNetwork: Networks.Base,
      toToken: bridgeQuote.toToken
    },
    output: evmIO(EvmToken.USDC, Networks.Base, bridgeQuote.outputAmountDecimal, bridgeQuote.outputAmountRaw)
  };
}
