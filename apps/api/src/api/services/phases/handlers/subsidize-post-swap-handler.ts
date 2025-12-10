import {
  ApiManager,
  AssetHubToken,
  FiatToken,
  nativeToDecimal,
  RampDirection,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata, TokenAccountBalance } from "../meta-state-types";

// Timeout for waiting for balance to reach expected amount after subsidy transfer
// Post-swap uses a shorter timeout as it's later in the flow and needs to be more responsive
const BALANCE_CHECK_TIMEOUT_MS = 2000;

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

      const currentBalance = Big((balanceResponse.toJSON() as TokenAccountBalance)?.free ?? "0");
      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on pendulum");
      }

      // Add a default/base expected output amount from the swap
      let expectedSwapOutputAmountRaw = Big(quote.metadata.nablaSwap.outputAmountRaw).plus(
        quote.metadata.subsidy.subsidyAmountInOutputTokenRaw
      );

      // Try to find the required amount to subsidize on the quote metadata
      if (state.type === RampDirection.BUY) {
        if (quote.metadata.pendulumToHydrationXcm) {
          expectedSwapOutputAmountRaw = Big(quote.metadata.pendulumToHydrationXcm.inputAmountRaw);
        } else if (quote.metadata.pendulumToAssethubXcm) {
          expectedSwapOutputAmountRaw = Big(quote.metadata.pendulumToAssethubXcm.inputAmountRaw);
        } else if (quote.metadata.pendulumToMoonbeamXcm) {
          expectedSwapOutputAmountRaw = Big(quote.metadata.pendulumToMoonbeamXcm.inputAmountRaw);
        }
      } else {
        if (quote.metadata.pendulumToMoonbeamXcm) {
          expectedSwapOutputAmountRaw = Big(quote.metadata.pendulumToMoonbeamXcm.inputAmountRaw);
        } else if (quote.metadata.pendulumToStellar) {
          expectedSwapOutputAmountRaw = Big(quote.metadata.pendulumToStellar.inputAmountRaw);
        }
      }

      const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);

      const didBalanceReachExpected = async () => {
        const balanceResponse = await pendulumNode.api.query.tokens.accounts(
          substrateEphemeralAddress,
          quote.metadata.nablaSwap?.outputCurrencyId
        );

        const currentBalance = Big((balanceResponse.toJSON() as TokenAccountBalance)?.free ?? "0");
        const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);
        return requiredAmount.lte(Big(0));
      };

      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        logger.info(
          `Subsidizing post-swap with ${requiredAmount.toFixed()} to reach target value of ${expectedSwapOutputAmountRaw}`
        );
        const fundingAccountKeypair = getFundingAccount();
        const result = await apiManager.executeApiCall(
          api =>
            api.tx.tokens.transfer(
              substrateEphemeralAddress,
              quote.metadata.nablaSwap?.outputCurrencyId,
              requiredAmount.toFixed(0, 0)
            ),
          fundingAccountKeypair,
          networkName
        );

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwap.outputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwap.outputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccountKeypair.address, result.hash);

        // Wait for the balance to update
        await waitUntilTrueWithTimeout(didBalanceReachExpected, BALANCE_CHECK_TIMEOUT_MS);
      }

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state, quote));
    } catch (e) {
      logger.error("Error in subsidizePostSwap:", e);
      throw this.createRecoverableError("SubsidizePostSwapPhaseHandler: Failed to subsidize post swap.");
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
