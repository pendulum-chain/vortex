import { ApiManager, decodeSubmittableExtrinsic, logger, RampPhase, submitMoonbeamXcm, waitUntilTrue } from "@vortexfi/shared";
import Big from "big.js";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { RecoverablePhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const MINIMUM_WAIT_SECONDS_FOR_EXHAUSTION = 1800; // 30 minutes
const MINIMUM_WAIT_SECONDS_FOR_BANNED_OR_INVALID = 60; // 1 minute
export class MoonbeamToPendulumXcmPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "moonbeamToPendulumXcm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const apiManager = ApiManager.getInstance();

    // Check if there's a previous error for this phase to determine if we should use RPC shuffling
    const hasPreviousError = state.errorLogs.some(log => log.phase === "moonbeamToPendulumXcm");

    // Use shuffling on (a potential) retry when there's a previous error, otherwise use the default RPC
    // Failure to obtain an RPC handle means we have exhausted all options, we should fail recoverably with larger waits.
    let moonbeamNode;
    try {
      moonbeamNode = hasPreviousError
        ? await apiManager.getApiWithShuffling("moonbeam", state.id)
        : await apiManager.getApi("moonbeam");
    } catch (e) {
      throw new RecoverablePhaseError(
        "MoonbeamToPendulumXcmPhaseHandler: All RPC options exhausted.",
        MINIMUM_WAIT_SECONDS_FOR_EXHAUSTION
      );
    }

    // TODO if no node is returned, we fail recoverably but wait a longer amount here. For this phase, and current failure mode
    // it is known to be at least 30 minues.

    const pendulumNode = await apiManager.getApi("pendulum");

    const { substrateEphemeralAddress, evmEphemeralAddress } = state.state as StateMetadata;

    if (!substrateEphemeralAddress || !evmEphemeralAddress) {
      throw new Error("MoonbeamToPendulumXcmPhaseHandler: State metadata corrupted. This is a bug.");
    }

    const didInputTokenArriveOnPendulum = async () => {
      if (!quote.metadata.nablaSwap) {
        throw new Error("MoonbeamToPendulumXcmPhaseHandler: Missing nablaSwap info in quote metadata");
      }

      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        substrateEphemeralAddress,
        quote.metadata.nablaSwap.inputCurrencyId
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      return currentBalance.gt(Big(0));
    };

    try {
      if (!(await didInputTokenArriveOnPendulum())) {
        const { txData: moonbeamToPendulumXcmTransaction } = this.getPresignedTransaction(state, "moonbeamToPendulumXcm");

        const xcmTransaction = decodeSubmittableExtrinsic(moonbeamToPendulumXcmTransaction as string, moonbeamNode.api);

        // Check nonce of account
        const txNonce = xcmTransaction.nonce.toNumber();
        const accountNonce = await moonbeamNode.api.rpc.system.accountNextIndex(evmEphemeralAddress);
        if (txNonce !== accountNonce.toNumber()) {
          logger.current.warn(
            `Nonce mismatch for XCM transaction of account ${evmEphemeralAddress}: expected ${accountNonce.toNumber()}, got ${txNonce}`
          );
        }

        await submitMoonbeamXcm(evmEphemeralAddress, xcmTransaction);
      }
    } catch (error) {
      if (error && error instanceof Error) {
        if (error.message.includes("IsInvalid") || error.message.includes("banned")) {
          throw new RecoverablePhaseError(
            "MoonbeamToPendulumXcmPhaseHandler: XCM transaction is invalid or banned, but we assume it can be fixed with resubmission.",
            MINIMUM_WAIT_SECONDS_FOR_BANNED_OR_INVALID
          );
        }
      }
      console.error("Error while executing moonbeam-to-pendulum xcm:", error);
      throw new Error("MoonbeamToPendulumXcmPhaseHandler: Failed to send XCM transaction");
    }

    try {
      logger.current.info("waiting for token to arrive on pendulum...");
      await waitUntilTrue(didInputTokenArriveOnPendulum, 5000);
    } catch (e) {
      console.error("Error while waiting for transaction receipt:", e);
      throw new Error("MoonbeamToPendulumXcmPhaseHandler: Failed to wait for tokens to arrive on Pendulum.");
    }

    return this.transitionToNextPhase(state, "subsidizePreSwap");
  }
}

export default new MoonbeamToPendulumXcmPhaseHandler();
