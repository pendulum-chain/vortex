import {
  ApiManager,
  decodeSubmittableExtrinsic,
  getAddressForFormat,
  RampPhase,
  submitXTokens,
  waitUntilTrue
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class PendulumToHydrationXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "pendulumToHydrationXcm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");
    const hydrationNode = await apiManager.getApi("hydration");

    const { substrateEphemeralAddress } = state.state as StateMetadata;

    if (!substrateEphemeralAddress) {
      throw new Error("Pendulum ephemeral address is not defined in the state. This is a bug.");
    }

    const didInputTokenArriveOnHydration = async () => {
      if (!quote.metadata.hydrationSwap) {
        throw new Error("MoonbeamToPendulumXcmPhaseHandler: Missing hydrationSwap info in quote metadata");
      }

      const balanceResponse = await hydrationNode.api.query.tokens.accounts(
        substrateEphemeralAddress,
        quote.metadata.hydrationSwap.inputAsset
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      return currentBalance.gt(Big(0));
    };

    try {
      const { txData: pendulumToHydrationTransaction } = this.getPresignedTransaction(state, "pendulumToHydrationXcm");

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToHydrationTransaction as string, pendulumNode.api);
      const { hash } = await submitXTokens(
        getAddressForFormat(substrateEphemeralAddress, pendulumNode.ss58Format),
        xcmExtrinsic
      );

      state.state = {
        ...state.state,
        pendulumToHydrationXcmHash: hash
      };
      await state.update({ state: state.state });

      logger.info("Waiting for assets to arrive on Hydration");
      await waitUntilTrue(didInputTokenArriveOnHydration, 60000);

      return this.transitionToNextPhase(state, "hydrationSwap");
    } catch (e) {
      console.error("Error in pendulumToHydrationXcm phase:", e);
      throw e;
    }
  }
}

export default new PendulumToHydrationXCMPhaseHandler();
