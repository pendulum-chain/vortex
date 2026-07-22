import { ApiManager, decodeSubmittableExtrinsic, RampPhase, submitMoonbeamXcm, waitUntilTrue } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { RecoverablePhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getBlockMetadata } from "../../core/metadata";
import { MoonbeamToPendulumXcmContext } from ".";

export class MoonbeamToPendulumXcmExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "moonbeamToPendulumXcm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) throw new Error("Quote not found for the given state");
    const metadata = getBlockMetadata(quote.metadata, MoonbeamToPendulumXcmContext);
    const substrateAddress = state.state.substrateEphemeralAddress;
    const evmAddress = state.state.evmEphemeralAddress;
    if (!substrateAddress || !evmAddress) throw new Error("MoonbeamToPendulumXcmExecutor: missing ephemeral account");

    const manager = ApiManager.getInstance();
    const pendulum = await manager.getApi("pendulum");
    const arrived = async () => {
      const balance = await pendulum.api.query.tokens.accounts(substrateAddress, metadata.pendulumCurrencyId);
      return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0").gt(0);
    };
    if (!(await arrived())) {
      const hasPreviousError = state.errorLogs.some(log => log.phase === this.getPhaseName());
      let moonbeam;
      try {
        moonbeam = hasPreviousError
          ? await manager.getApiWithShuffling("moonbeam", state.id)
          : await manager.getApi("moonbeam");
      } catch {
        throw new RecoverablePhaseError("MoonbeamToPendulumXcmExecutor: All RPC options exhausted.", 1800);
      }
      try {
        const presigned = this.getPresignedTransaction(state, this.getPhaseName());
        const extrinsic = decodeSubmittableExtrinsic(presigned.txData as string, moonbeam.api);
        await submitMoonbeamXcm(evmAddress, extrinsic);
      } catch (error) {
        logger.error("MoonbeamToPendulumXcmExecutor: XCM submission failed", error);
        const message = error instanceof Error ? error.message : String(error);
        throw new RecoverablePhaseError(
          message.includes("IsInvalid") || message.includes("banned")
            ? "MoonbeamToPendulumXcmExecutor: XCM transaction is invalid or banned"
            : "MoonbeamToPendulumXcmExecutor: Failed to send XCM transaction",
          message.includes("IsInvalid") || message.includes("banned") ? 60 : 120
        );
      }
    }
    await waitUntilTrue(arrived, 5000);
    return state;
  }
}
