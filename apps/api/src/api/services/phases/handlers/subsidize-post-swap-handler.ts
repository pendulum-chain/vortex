import { ApiManager, AssetHubToken, FiatToken, RampDirection, RampPhase } from "@packages/shared";
import { nativeToDecimal } from "@packages/shared/src/helpers/parseNumbers";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class SubsidizePostSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePostSwap";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const { substrateEphemeralAddress } = state.state as StateMetadata;

    if (!substrateEphemeralAddress) {
      throw new Error("SubsidizePostSwapPhaseHandler: State metadata corrupted. This is a bug.");
    }

    if (!quote.metadata.nablaSwap) {
      throw new Error("Missing nablaSwap in quote metadata");
    }

    if (!quote.metadata.subsidy) {
      throw new Error("Missing subsidy information in quote metadata");
    }

    try {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        substrateEphemeralAddress,
        quote.metadata.nablaSwap.outputCurrencyId
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on pendulum");
      }

      // Add the (potential) subsidy amount to the expected swap output to get the target balance
      const expectedSwapOutputAmountRaw =
        quote.metadata.nablaSwap.outputAmountRaw + quote.metadata.subsidy.subsidyAmountInOutputTokenRaw;

      const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);
      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        logger.info(
          `Subsidizing post-swap with ${requiredAmount.toFixed()} to reach target value of ${expectedSwapOutputAmountRaw}`
        );
        const fundingAccountKeypair = getFundingAccount();
        const txHash = await pendulumNode.api.tx.tokens
          .transfer(substrateEphemeralAddress, quote.metadata.nablaSwap.outputCurrencyId, requiredAmount.toFixed(0, 0))
          .signAndSend(fundingAccountKeypair);

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwap.outputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwap.outputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccountKeypair.address, txHash.toString());
      }

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state, quote));
    } catch (e) {
      logger.error("Error in subsidizePostSwap:", e);
      throw new Error("SubsidizePostSwapPhaseHandler: Failed to subsidize post swap.");
    }
  }

  protected nextPhaseSelector(state: RampState, quote: QuoteTicket): RampPhase {
    // onramp cases
    if (state.type === RampDirection.BUY) {
      if (state.to === "assethub") {
        if (quote.outputCurrency === AssetHubToken.USDC) {
          // USDC can directly go to AssetHub
          return "pendulumToAssethubXcm";
        } else {
          // USDT and DOT need to go via Hydration
          return "pendulumToHydrationXcm";
        }
      }
      return "pendulumToMoonbeamXcm";
    }

    // off ramp cases
    if (quote.outputCurrency === FiatToken.BRL) {
      return "pendulumToMoonbeamXcm";
    }
    return "spacewalkRedeem";
  }
}

export default new SubsidizePostSwapPhaseHandler();
