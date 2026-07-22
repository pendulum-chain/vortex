import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { AveniaMoonbeamMint } from "../phases/avenia-moonbeam-mint";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { MoonbeamToPendulumXcm } from "../phases/moonbeam-to-pendulum-xcm";
import { PendulumDistributeFees } from "../phases/pendulum-distribute-fees";
import { PendulumNablaSwap } from "../phases/pendulum-nabla-swap";
import { PendulumSubsidizePost } from "../phases/pendulum-subsidize-post";
import { PendulumSubsidizePre } from "../phases/pendulum-subsidize-pre";
import { PendulumToAssethubXcm } from "../phases/pendulum-to-assethub-xcm";

export const brlOnrampAssethubUsdcFlow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaMoonbeamMint)
  .pipe(FundEphemeral(EvmToken.BRLA, Networks.Moonbeam))
  .pipe(MoonbeamToPendulumXcm)
  .pipe(PendulumSubsidizePre)
  .pipe(PendulumNablaSwap)
  .pipe(PendulumDistributeFees)
  .pipe(PendulumSubsidizePost)
  .pipe(PendulumToAssethubXcm)
  .build("BrlOnrampAssethubUsdc");
