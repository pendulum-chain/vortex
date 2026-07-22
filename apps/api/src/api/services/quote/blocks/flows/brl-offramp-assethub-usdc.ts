import { AssetHubToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { assetHubRequestIO } from "../core/io";
import { AssethubOfframpSource } from "../phases/assethub-offramp-source";
import { AveniaOfframpFee } from "../phases/avenia-offramp-fee";
import { AveniaPendulumOfframp } from "../phases/avenia-pendulum-offramp";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { PendulumAssethubDistributeFees } from "../phases/pendulum-distribute-fees";
import { PendulumOfframpNablaSwap } from "../phases/pendulum-offramp-nabla-swap";
import { PendulumOfframpSubsidizePost } from "../phases/pendulum-offramp-subsidize-post";
import { PendulumOfframpSubsidizePre } from "../phases/pendulum-offramp-subsidize-pre";

export const brlOfframpAssethubUsdcFlow = FlowBuilder.start(assetHubRequestIO(AssetHubToken.USDC), AssethubOfframpSource)
  .pipe(FundEphemeral(AssetHubToken.USDC, Networks.Pendulum))
  .pipe(PendulumAssethubDistributeFees)
  .pipe(PendulumOfframpSubsidizePre)
  .pipe(PendulumOfframpNablaSwap)
  .pipe(AveniaOfframpFee<typeof FiatToken.BRL, typeof Networks.Pendulum>())
  .pipe(PendulumOfframpSubsidizePost)
  .pipe(AveniaPendulumOfframp)
  .build("BrlOfframpAssethubUsdc");
