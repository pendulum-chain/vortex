import { EvmToken, FiatToken, getNetworkFromDestination, Networks, type OnChainToken } from "@vortexfi/shared";
import Big from "big.js";
import { overrideFees } from "../../core/fees";
import { getEvmBridgeQuote } from "../../core/squidrouter";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "./execution";
import { type AveniaMintRegistrationFacts, type AveniaMintRegistrationInput, registerAveniaMint } from "./registration";
import { AveniaMintContext, simulateAveniaMint } from "./simulation";
import { prepareAveniaMintTxs } from "./transactions";

export const AveniaMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>,
  AveniaMintRegistrationFacts,
  AveniaMintRegistrationInput
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  externalOperations: { register: { provider: "avenia" } },
  name: "AveniaMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaMintTxs,
  register: registerAveniaMint,
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
