import type { RampPhase } from "@vortexfi/shared";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";

export class MoneriumOnrampMintExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "moneriumOnrampMint";
  }

  protected async executePhase(_state: RampState, _signal?: AbortSignal): Promise<RampState> {
    throw this.createUnrecoverableError(
      "MoneriumOnrampMintExecutor: deterministic incoming-payment correlation is not available; settlement is disabled"
    );
  }
}
