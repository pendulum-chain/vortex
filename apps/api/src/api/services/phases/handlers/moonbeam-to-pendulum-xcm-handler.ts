import { ApiManager, decodeSubmittableExtrinsic, logger, RampPhase, submitMoonbeamXcm, waitUntilTrue } from "@vortexfi/shared";
import Big from "big.js";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

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
    const moonbeamNode = await apiManager.getApi("moonbeam");
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

        // TODO verify this works on Moonbeam also. It does not.
        await submitMoonbeamXcm(evmEphemeralAddress, xcmTransaction);
      }
    } catch (e) {
      console.error("Error while executing moonbeam-to-pendulum xcm:", e);
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
