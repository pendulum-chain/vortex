import { EvmToken, FiatToken, getNetworkFromDestination, Networks, type OnChainToken } from "@vortexfi/shared";
import Big from "big.js";
import { getEvmBridgeQuote } from "../../../core/squidrouter";
import { overrideFees } from "../../core/fees";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "./execution";
import { AveniaMintContext, simulateAveniaMint } from "./simulation";
import { prepareAveniaMintTxs } from "./transactions";

export const AveniaMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  name: "AveniaMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaMintTxs,
  async simulate(input, ctx) {
    const result = await simulateAveniaMint(input, ctx);
    const toNetwork = getNetworkFromDestination(ctx.request.to);
    if (!toNetwork) {
      throw new Error(`AveniaMint: invalid network for destination: ${ctx.request.to}`);
    }
    const networkFeeUSD =
      toNetwork === Networks.Base && ctx.request.outputCurrency === EvmToken.USDC
        ? "0"
        : (
            await getEvmBridgeQuote({
              amountDecimal: ctx.request.inputAmount,
              fromNetwork: Networks.Base,
              inputCurrency: EvmToken.USDC,
              outputCurrency: ctx.request.outputCurrency as OnChainToken,
              rampType: ctx.request.rampType,
              toNetwork
            })
          ).networkFeeUSD;
    return {
      ...result,
      fees: await overrideFees(ctx, {
        anchor: {
          amount: new Big(result.metadata.mint.fee).plus(result.metadata.transfer.fee).toString(),
          currency: FiatToken.BRL
        },
        network: { amount: networkFeeUSD, currency: EvmToken.USDC }
      })
    };
  }
};
