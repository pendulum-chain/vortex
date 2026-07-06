import {
  ApiManager,
  AssetHubToken,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  getOnChainTokenDetails,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampDirection,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { PhaseError } from "../../../errors/phase-error";
import { priceFeedService } from "../../priceFeed.service";
import { BasePhaseHandler } from "../base-phase-handler";
import { getEvmFundingAccount } from "../evm-funding";
import { calculatePostSwapSubsidyComponents } from "../helpers/post-swap-subsidy-breakdown";
import { StateMetadata } from "../meta-state-types";

// Overridable so hermetic tests don't wait 15s for a settlement that the fake
// world applies instantly (same pattern as PHASE_PROCESSOR_RETRY_DELAY_MS).
const EVM_SETTLEMENT_DELAY_MS = parseInt(process.env.SUBSIDY_SETTLEMENT_DELAY_MS || "15000", 10);

export class SubsidizePostSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePostSwap";
  }

  public getMaxRetries(): number {
    return 200;
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (quote.metadata.nablaSwapEvm) {
      return this.executeEvmSubsidize(state, quote);
    }

    return this.executeSubstrateSubsidize(state, quote);
  }

  private async executeSubstrateSubsidize(state: RampState, quote: QuoteTicket): Promise<RampState> {
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

      const balanceJson = balanceResponse.toJSON() as { free?: string | number } | null;
      const currentBalance = Big(String(balanceJson?.free ?? "0"));
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
        }
      }

      const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);

      const didBalanceReachExpected = async () => {
        const balanceResponse = await pendulumNode.api.query.tokens.accounts(
          substrateEphemeralAddress,
          quote.metadata.nablaSwap?.outputCurrencyId
        );

        const innerJson = balanceResponse.toJSON() as { free?: string | number } | null;
        const currentBalance = Big(String(innerJson?.free ?? "0"));
        const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);
        return requiredAmount.lte(Big(0));
      };

      if (requiredAmount.gt(Big(0))) {
        const fundingAccountKeypair = getFundingAccount();

        const fundingBalanceResponse = await pendulumNode.api.query.tokens.accounts(
          fundingAccountKeypair.address,
          quote.metadata.nablaSwap?.outputCurrencyId
        );
        const fundingBalanceJson = fundingBalanceResponse.toJSON() as { free?: string | number } | null;
        const fundingBalance = Big(String(fundingBalanceJson?.free ?? "0"));
        if (fundingBalance.lt(requiredAmount)) {
          throw this.createUnrecoverableError(
            `SubsidizePostSwapPhaseHandler: Funding account balance too low for subsidy: has ${fundingBalance.toFixed(0)}, needs ${requiredAmount.toFixed(0)}`
          );
        }

        logger.info(
          `Subsidizing post-swap with ${requiredAmount.toFixed()} to reach target value of ${expectedSwapOutputAmountRaw.toFixed(0, 0)}`
        );
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
        await waitUntilTrueWithTimeout(didBalanceReachExpected, 2000);
      }

      return this.transitionToNextPhase(state, this.substrateNextPhaseSelector(state, quote));
    } catch (e) {
      logger.error("Error in subsidizePostSwap (substrate):", e);
      throw this.createRecoverableError("SubsidizePostSwapPhaseHandler: Failed to subsidize post swap.");
    }
  }

  private async executeEvmSubsidize(state: RampState, quote: QuoteTicket): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePostSwapPhaseHandler: State metadata corrupted. This is a bug.");
    }

    if (!quote.metadata.evmToEvm) {
      throw new Error("Missing evmToEvm information in quote metadata");
    }

    if (!quote.metadata.nablaSwapEvm) {
      throw new Error("Missing nablaSwapEvm information in quote metadata");
    }

    if (!quote.metadata.subsidy) {
      throw new Error("Missing subsidy information in quote metadata");
    }

    try {
      // Get token details for the output token
      const outputToken = quote.metadata.nablaSwapEvm.outputCurrency as EvmToken;

      const outputTokenDetails = getOnChainTokenDetails(Networks.Base, outputToken) as EvmTokenDetails;
      if (!outputTokenDetails) {
        throw new Error(
          `Could not find token details for output token ${outputToken} on network ${Networks.Base}. Invalid quote metadata.`
        );
      }

      // Wait for token settlement before checking balance
      await new Promise(resolve => setTimeout(resolve, EVM_SETTLEMENT_DELAY_MS));

      // Check current balance on EVM
      const currentBalance = await checkEvmBalanceForToken({
        amountDesiredRaw: "1",
        chain: outputTokenDetails.network as EvmNetworks,
        intervalMs: 1000, // Just check if there's any balance
        ownerAddress: evmEphemeralAddress,
        timeoutMs: 5000,
        tokenDetails: outputTokenDetails
      });

      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on EVM");
      }

      // Add a default/base expected output amount from the swap
      let expectedSwapOutputAmountRaw = Big(quote.metadata.nablaSwapEvm.outputAmountRaw).plus(
        quote.metadata.subsidy.subsidyAmountInOutputTokenRaw
      );

      logger.debug(`SubsidizePostSwapHandler (EVM): expectedSwapOutputAmountRaw ${expectedSwapOutputAmountRaw.toFixed(0, 0)}`);

      // Try to find the required amount to subsidize on the quote metadata
      if (state.type === RampDirection.BUY) {
        // For BUY operations, use the evmToEvm inputAmountRaw as the expected amount
        expectedSwapOutputAmountRaw = Big(quote.metadata.evmToEvm?.inputAmountRaw);
      } else {
        expectedSwapOutputAmountRaw = Big(quote.metadata.nablaSwapEvm.outputAmountRaw);
      }

      const subsidyComponents = calculatePostSwapSubsidyComponents({
        currentBalanceRaw: currentBalance,
        discountSubsidyAmountRaw: quote.metadata.subsidy.subsidyAmountInOutputTokenRaw,
        expectedOutputAmountRaw: expectedSwapOutputAmountRaw,
        quotedActualOutputAmountRaw: quote.metadata.subsidy.actualOutputAmountRaw
      });
      const requiredAmount = subsidyComponents.requiredAmountRaw;
      logger.debug(
        `SubsidizePostSwapHandler (EVM): requiredAmount ${requiredAmount.toFixed(0, 0)}, ` +
          `discrepancyAmount ${subsidyComponents.discrepancyAmountRaw.toFixed(0, 0)}, ` +
          `discountAmount ${subsidyComponents.discountAmountRaw.toFixed(0, 0)}`
      );

      if (requiredAmount.gt(Big(0))) {
        const discrepancySubsidyDecimal = nativeToDecimal(
          subsidyComponents.discrepancyAmountRaw,
          quote.metadata.nablaSwapEvm.outputDecimals
        ).toFixed();
        const discountSubsidyDecimal = nativeToDecimal(
          subsidyComponents.discountAmountRaw,
          quote.metadata.nablaSwapEvm.outputDecimals
        ).toFixed();
        const discrepancySubsidyUsd = subsidyComponents.discrepancyAmountRaw.gt(0)
          ? await priceFeedService.convertCurrency(
              discrepancySubsidyDecimal,
              outputToken as RampCurrency,
              EvmToken.USDC as RampCurrency
            )
          : "0";
        const discountSubsidyUsd = subsidyComponents.discountAmountRaw.gt(0)
          ? await priceFeedService.convertCurrency(
              discountSubsidyDecimal,
              outputToken as RampCurrency,
              EvmToken.USDC as RampCurrency
            )
          : "0";
        const quoteOutputUsd = await priceFeedService.convertCurrency(
          quote.outputAmount,
          quote.outputCurrency as RampCurrency,
          EvmToken.USDC as RampCurrency
        );
        const discrepancySubsidyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
        const discrepancySubsidyCapUsd = Big(quoteOutputUsd).mul(discrepancySubsidyCapFraction);
        if (Big(discrepancySubsidyUsd).gt(discrepancySubsidyCapUsd)) {
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePostSwapPhaseHandler: Required swap discrepancy subsidy $${discrepancySubsidyUsd} exceeds cap $${discrepancySubsidyCapUsd.toFixed(2)} (${discrepancySubsidyCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }

        const discountSubsidyCapFraction = config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction;
        const discountSubsidyCapUsd = Big(quoteOutputUsd).mul(discountSubsidyCapFraction);
        if (Big(discountSubsidyUsd).gt(discountSubsidyCapUsd)) {
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePostSwapPhaseHandler: Required discount subsidy $${discountSubsidyUsd} exceeds cap $${discountSubsidyCapUsd.toFixed(2)} (${discountSubsidyCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }

        const subsidyUsd = Big(discrepancySubsidyUsd).plus(discountSubsidyUsd).toFixed();

        // Do the actual subsidizing on EVM
        logger.info(
          `Subsidizing post-swap EVM with ${requiredAmount.toFixed()} ($${subsidyUsd}) to reach target value of ${expectedSwapOutputAmountRaw.toFixed(0, 0)}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const destinationNetwork = outputTokenDetails.network as EvmNetworks;
        const fundingAccount = getEvmFundingAccount(destinationNetwork);

        // Get gas estimates
        const publicClient = evmClientManager.getClient(destinationNetwork);
        const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

        // ERC-20 transfer.
        const data = encodeFunctionData({
          abi: erc20Abi,
          args: [evmEphemeralAddress as `0x${string}`, BigInt(requiredAmount.toFixed(0))],
          functionName: "transfer"
        });

        const txHash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
          data,
          maxFeePerGas,
          maxPriorityFeePerGas,
          to: outputTokenDetails.erc20AddressSourceChain as `0x${string}`,
          value: 0n
        });

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwapEvm.outputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwapEvm.outputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SubsidizePostSwapPhaseHandler: Subsidy transaction ${txHash} failed or was not found`);
        }
      }

      return this.transitionToNextPhase(state, this.evmNextPhaseSelector(state, quote));
    } catch (e) {
      logger.error("Error in subsidizePostSwap (EVM):", e);
      if (e instanceof PhaseError) {
        throw e;
      }
      throw this.createRecoverableError("SubsidizePostSwapPhaseHandler: Failed to subsidize post swap on EVM.");
    }
  }

  protected substrateNextPhaseSelector(state: RampState, quote: QuoteTicket): RampPhase {
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

    if (state.type === RampDirection.SELL) {
      throw new Error("SubsidizePostSwapPhaseHandler: Unsupported non-BRL offramp route after Stellar deprecation");
    }

    throw new Error(
      `SubsidizePostSwapPhaseHandler: Unrecognized routing combination: direction=${state.type}, to=${state.to}, output=${quote.outputCurrency}`
    );
  }

  protected evmNextPhaseSelector(state: RampState, quote: QuoteTicket): RampPhase {
    if (state.type === RampDirection.BUY) {
      return "squidRouterSwap";
    }
    if (quote.outputCurrency === FiatToken.EURC) {
      return "mykoboPayoutOnBase";
    }
    return "brlaPayoutOnBase";
  }
}

export default new SubsidizePostSwapPhaseHandler();
