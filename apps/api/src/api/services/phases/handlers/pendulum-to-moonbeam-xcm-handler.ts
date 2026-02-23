import {
  ApiManager,
  AXL_USDC_MOONBEAM,
  decodeSubmittableExtrinsic,
  FiatToken,
  getAddressForFormat,
  getAnyFiatTokenDetailsMoonbeam,
  getEvmTokenBalance,
  MOONBEAM_XCM_FEE_GLMR,
  Networks,
  nativeToDecimal,
  PENDULUM_USDC_AXL,
  RampDirection,
  RampPhase,
  submitXTokens
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { BasePhaseHandler } from "../base-phase-handler";

export class PendulumToMoonbeamXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "pendulumToMoonbeamXcm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");

    const quote = await QuoteTicket.findByPk(state.quoteId);

    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const { substrateEphemeralAddress, evmEphemeralAddress, brlaEvmAddress } = state.state;

    if (!substrateEphemeralAddress) {
      throw new Error("Ephemeral address not defined in the state. This is a bug.");
    }

    if (!evmEphemeralAddress && !brlaEvmAddress) {
      throw new Error(
        "Moonbeam ephemeral address and BRL EVM address not defined in the state. One of them should be defined. This is a bug."
      );
    }

    if (!quote.metadata.pendulumToMoonbeamXcm?.outputAmountRaw) {
      throw new Error("Missing output amount for Pendulum to Moonbeam XCM in quote metadata");
    }

    const expectedOutputAmountRaw = quote.metadata.pendulumToMoonbeamXcm.outputAmountRaw;

    const didTokensLeavePendulum = async () => {
      // Token is always either axlUSDC or BRL.
      const currencyId =
        state.type === RampDirection.SELL
          ? getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL).pendulumRepresentative.currencyId
          : PENDULUM_USDC_AXL.currencyId;
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(substrateEphemeralAddress, currencyId);

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      return currentBalance.lt(expectedOutputAmountRaw);
    };

    const didTokensArriveOnMoonbeam = async () => {
      // Token is always either axlUSDC or BRL.
      const tokenAddress =
        state.type === RampDirection.SELL
          ? getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL).moonbeamErc20Address
          : AXL_USDC_MOONBEAM;
      const ownerAddress =
        state.type === RampDirection.SELL && quote.outputCurrency === FiatToken.BRL ? brlaEvmAddress : evmEphemeralAddress;

      const balance = await getEvmTokenBalance({
        chain: Networks.Moonbeam,
        ownerAddress: ownerAddress as `0x${string}`,
        tokenAddress: tokenAddress as `0x${string}`
      });

      return balance.gte(expectedOutputAmountRaw);
    };

    const waitForMoonbeamArrival = async (timeoutMs = 120000): Promise<boolean> => {
      const startTime = Date.now();
      const pollIntervalMs = 5000;

      while (Date.now() - startTime < timeoutMs) {
        if (await didTokensArriveOnMoonbeam()) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
      return false;
    };

    try {
      // Check if we already have a stored XCM hash (XCM was submitted in a previous attempt)
      if (state.state.pendulumToMoonbeamXcmHash) {
        logger.info(
          `PendulumToMoonbeamPhaseHandler: XCM already submitted (hash: ${state.state.pendulumToMoonbeamXcmHash}) for ramp ${state.id}. Waiting for arrival on Moonbeam...`
        );

        if (await didTokensArriveOnMoonbeam()) {
          logger.info(`PendulumToMoonbeamPhaseHandler: Tokens already arrived on Moonbeam for ramp ${state.id}.`);
          return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
        }

        const arrived = await waitForMoonbeamArrival();
        if (!arrived) {
          throw this.createRecoverableError("Timeout waiting for tokens to arrive on Moonbeam after XCM was already submitted");
        }
        return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
      }

      // Check if tokens already left Pendulum (XCM was submitted but hash wasn't stored due to crash)
      if (await didTokensLeavePendulum()) {
        logger.info(
          `PendulumToMoonbeamPhaseHandler: Tokens already left Pendulum for ramp ${state.id}. XCM likely submitted but hash not stored. Waiting for arrival on Moonbeam...`
        );

        if (await didTokensArriveOnMoonbeam()) {
          logger.info(`PendulumToMoonbeamPhaseHandler: Tokens already arrived on Moonbeam for ramp ${state.id}.`);
          return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
        }

        const arrived = await waitForMoonbeamArrival();
        if (!arrived) {
          throw this.createRecoverableError("Timeout waiting for tokens to arrive on Moonbeam after tokens left Pendulum");
        }
        return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
      }

      // No previous XCM submission detected, proceed with transfer
      const { txData: pendulumToMoonbeamTransaction } = this.getPresignedTransaction(state, "pendulumToMoonbeamXcm");

      if (typeof pendulumToMoonbeamTransaction !== "string") {
        throw new Error("PendulumToMoonbeamPhaseHandler: Invalid transaction data. This is a bug.");
      }

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToMoonbeamTransaction, pendulumNode.api);
      logger.info(`PendulumToMoonbeamPhaseHandler: Submitting XCM transfer to Moonbeam for ramp ${state.id}`);
      const { hash } = await submitXTokens(
        getAddressForFormat(substrateEphemeralAddress, pendulumNode.ss58Format),
        xcmExtrinsic
      );

      logger.info(
        `PendulumToMoonbeamPhaseHandler: XCM transfer submitted with hash ${hash} for ramp ${state.id}. Waiting for the token to arrive on Moonbeam...`
      );

      // Store the hash immediately after submission to minimize crash window
      state.state = {
        ...state.state,
        pendulumToMoonbeamXcmHash: hash
      };
      await state.update({ state: state.state });

      const arrived = await waitForMoonbeamArrival();
      if (!arrived) {
        throw this.createRecoverableError("Timeout waiting for tokens to arrive on Moonbeam after XCM submission");
      }

      // XCM is payed by the ephemeral, in GLMR, with a fixed value of MOONBEAM_XCM_FEE_GLMR
      const subsidyAmount = nativeToDecimal(MOONBEAM_XCM_FEE_GLMR, 18).toNumber();
      const hashToStore = hash ?? "0x";
      await this.createSubsidy(state, subsidyAmount, SubsidyToken.GLMR, substrateEphemeralAddress, hashToStore);

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
    } catch (e) {
      console.error("Error in PendulumToMoonbeamPhase:", e);
      throw this.createRecoverableError("Error in PendulumToMoonbeamPhase");
    }
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    if (state.type === RampDirection.SELL) {
      return "brlaPayoutOnMoonbeam";
    } else {
      return "squidRouterSwap";
    }
  }
}

export default new PendulumToMoonbeamXCMPhaseHandler();
