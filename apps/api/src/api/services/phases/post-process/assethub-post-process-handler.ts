import { CleanupPhase } from "@vortexfi/shared";
import RampState from "../../../../models/rampState.model";
import { BasePostProcessHandler } from "./base-post-process-handler";

export class AssetHubPostProcessHandler extends BasePostProcessHandler {
  public getCleanupName(): CleanupPhase {
    return "assetHubCleanup";
  }

  public shouldProcess(_state: RampState): boolean {
    return false;
  }

  public async process(_state: RampState): Promise<[boolean, Error | null]> {
    return [true, null];
  }
}

export default new AssetHubPostProcessHandler();
