import { ApiManager, decodeSubmittableExtrinsic, getAddressForFormat, RampPhase, submitXTokens } from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { abortableCall, throwIfAborted } from "../../core/cancellation";

export class PendulumToAssethubXcmExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "pendulumToAssethubXcm";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const substrateAddress = state.state.substrateEphemeralAddress;
    if (!substrateAddress) throw new Error("PendulumToAssethubXcmExecutor: missing Substrate ephemeral");
    if (state.state.pendulumToAssethubXcmHash) return state;
    try {
      const pendulum = await ApiManager.getInstance().getApi("pendulum");
      const presigned = this.getPresignedTransaction(state, this.getPhaseName());
      const extrinsic = decodeSubmittableExtrinsic(presigned.txData as string, pendulum.api);
      throwIfAborted(signal);
      const { hash } = await this.runFinancialOperation(state, {
        attemptClass: "pendulum-assethub-xcm-broadcast",
        externalId: result => result.hash,
        perform: async () => {
          throwIfAborted(signal);
          return abortableCall(signal, () =>
            submitXTokens(getAddressForFormat(substrateAddress, pendulum.ss58Format), extrinsic)
          );
        },
        provider: "pendulum",
        request: { network: "pendulum", signedTransaction: presigned.txData },
        signal
      });
      state.state = { ...state.state, pendulumToAssethubXcmHash: hash };
      await state.update({ state: state.state });
      return state;
    } catch (error) {
      logger.error("PendulumToAssethubXcmExecutor failed", error);
      throw error;
    }
  }
}
