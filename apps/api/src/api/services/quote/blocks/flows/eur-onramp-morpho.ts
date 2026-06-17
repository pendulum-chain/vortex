import { EvmToken, Networks, RampDirection } from "@vortexfi/shared";
import { branch, passthrough } from "../core/combinators";
import { FlowBuilder } from "../core/flow";
import { assemblePhaseFlow } from "../core/phase-flow";
import { WithSubsidy } from "../core/subsidy";
import type { Flow, PhaseIO } from "../core/types";
import { MorphoMint } from "../phases/morpho-mint";
import { MykoboMint } from "../phases/mykobo-mint";
import { NablaSwap } from "../phases/nabla-swap";
import { SquidRouterSwap } from "../phases/squid-router-swap";

export const eurOnrampMorphoFlow: Flow = FlowBuilder.start(MykoboMint)
  .pipe(WithSubsidy(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC), { bookend: "subsidizePostSwap" }))
  .pipe(
    branch<
      PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
      PhaseIO<typeof EvmToken.USDC, typeof Networks.Base | typeof Networks.Arbitrum>
    >(
      ctx => (ctx.request.to === Networks.Base ? 0 : 1),
      [passthrough<EvmToken.USDC, Networks.Base>(), SquidRouterSwap(Networks.Base, Networks.Arbitrum, EvmToken.USDC)]
    )
  )
  .pipe(MorphoMint<Networks.Base | Networks.Arbitrum>())
  .build("EurOnrampMorpho");

export const eurOnrampMorphoPhaseFlow = assemblePhaseFlow(eurOnrampMorphoFlow, {
  direction: RampDirection.BUY,
  isBaseVault: false
});
export const eurOnrampMorphoBasePhaseFlow = assemblePhaseFlow(eurOnrampMorphoFlow, {
  direction: RampDirection.BUY,
  isBaseVault: true
});
