import { EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { Flow } from "../core/types";
import { DistributeFees } from "../phases/distribute-fees";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { MorphoMint } from "../phases/morpho-mint";
import { MykoboMint } from "../phases/mykobo-mint";
import { NablaSwap } from "../phases/nabla-swap";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import { SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

export const eurOnrampMorphoFlow: Flow = FlowBuilder.start(MykoboMint)
  .pipe(FundEphemeral<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(SubsidizePre<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC))
  .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SquidRouterSwap(Networks.Base, Networks.Arbitrum, EvmToken.USDC))
  .pipe(FinalSettlementSubsidy<typeof EvmToken.USDC, typeof Networks.Arbitrum>())
  .pipe(MorphoMint<typeof Networks.Arbitrum>())
  .build("EurOnrampMorpho");

export const eurOnrampBaseMorphoFlow: Flow = FlowBuilder.start(MykoboMint)
  .pipe(FundEphemeral<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(SubsidizePre<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC))
  .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(MorphoMint<typeof Networks.Base>())
  .build("EurOnrampBaseMorpho");

export const eurOnrampMorphoPhaseFlow = assemblePhaseFlow(eurOnrampMorphoFlow);
export const eurOnrampBaseMorphoPhaseFlow = assemblePhaseFlow(eurOnrampBaseMorphoFlow);
