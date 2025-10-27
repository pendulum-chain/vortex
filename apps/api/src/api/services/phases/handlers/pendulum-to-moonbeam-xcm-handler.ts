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
} from "@packages/shared";
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

    try {
      // We have to check if the input token already arrived on Moonbeam and if it left Pendulum.
      // If we'd only check if it arrived on Moonbeam, we might miss transferring them if the target account already has some tokens.
      if ((await didTokensLeavePendulum()) && (await didTokensArriveOnMoonbeam())) {
        logger.info(
          `PendulumToMoonbeamPhaseHandler: Input token already arrived on Moonbeam, skipping XCM transfer for ramp ${state.id}.`
        );
        return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
      }

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
      await didTokensArriveOnMoonbeam();

      // XCM is payed by the ephemeral, in GLMR, with a fixed value of MOONBEAM_XCM_FEE_GLMR
      const subsidyAmount = nativeToDecimal(MOONBEAM_XCM_FEE_GLMR, 18).toNumber();
      const hashToStore = hash ?? "0x";
      await this.createSubsidy(state, subsidyAmount, SubsidyToken.GLMR, substrateEphemeralAddress, hashToStore);

      state.state = {
        ...state.state,
        pendulumToMoonbeamXcmHash: hash
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
    } catch (e) {
      console.error("Error in PendulumToMoonbeamPhase:", e);
      throw e;
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
