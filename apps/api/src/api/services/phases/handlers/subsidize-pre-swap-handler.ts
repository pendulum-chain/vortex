import { ApiManager, nativeToDecimal, RampPhase, waitUntilTrue } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const SUBSIDY_TIMEOUT_MS = 180000; // 3 minutes

export class SubsidizePreSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
  }

  private async waitUntilTrueWithTimeout(test: () => Promise<boolean>, periodMs: number, timeoutMs: number): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout waiting for condition after ${timeoutMs} ms`)), timeoutMs);
    });

    const waitPromise = waitUntilTrue(test, periodMs);
    await Promise.race([waitPromise, timeoutPromise]);
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const quote = await QuoteTicket.findByPk(state.quoteId);

    const { substrateEphemeralAddress } = state.state as StateMetadata;

    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!substrateEphemeralAddress) {
      throw new Error("SubsidizePreSwapPhaseHandler: State metadata corrupted. This is a bug.");
    }

    if (!quote.metadata.nablaSwap) {
      throw new Error("Missing nablaSwap in quote metadata");
    }

    try {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        substrateEphemeralAddress,
        quote.metadata.nablaSwap.inputCurrencyId
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on pendulum");
      }

      const expectedInputAmountForSwapRaw = quote.metadata.nablaSwap.inputAmountForSwapRaw;

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);

      const didBalanceReachExpected = async () => {
        const balanceResponse = await pendulumNode.api.query.tokens.accounts(
          substrateEphemeralAddress,
          quote.metadata.nablaSwap!.inputCurrencyId
        );

        const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
        return currentBalance.gte(Big(expectedInputAmountForSwapRaw));
      };

      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        logger.info(
          `Subsidizing pre-swap with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );
        const fundingAccountKeypair = getFundingAccount();

        const result = await apiManager.executeApiCall(
          api =>
            api.tx.tokens.transfer(
              substrateEphemeralAddress,
              quote.metadata.nablaSwap!.inputCurrencyId,
              requiredAmount.toFixed(0, 0)
            ),
          fundingAccountKeypair,
          networkName
        );

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwap!.inputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwap!.inputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccountKeypair.address, result.hash);

        await this.waitUntilTrueWithTimeout(didBalanceReachExpected, 5000, SUBSIDY_TIMEOUT_MS);
      }

      return this.transitionToNextPhase(state, "nablaApprove");
    } catch (e) {
      console.error("Error in subsidizePreSwap:", e);
      throw this.createRecoverableError("SubsidizePreSwapPhaseHandler: Failed to subsidize pre swap.");
    }
  }
}

export default new SubsidizePreSwapPhaseHandler();
