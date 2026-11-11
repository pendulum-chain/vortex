import { CleanupPhase, EvmNetworks, Networks } from "@vortexfi/shared";
import { BaseChainPostProcessHandler } from "./base-chain-post-process-handler";

/** Sweeps what a fill above the promised stock amount left on the ephemeral. The funding wallet tops up buys from these. */
export class RobinhoodPostProcessHandler extends BaseChainPostProcessHandler {
  protected override readonly network: EvmNetworks = Networks.Robinhood;
  protected override readonly cleanupPhases: CleanupPhase[] = ["robinhoodCleanupStock"];

  public override getCleanupName(): CleanupPhase {
    return "robinhoodCleanupStock";
  }
}

export default new RobinhoodPostProcessHandler();
