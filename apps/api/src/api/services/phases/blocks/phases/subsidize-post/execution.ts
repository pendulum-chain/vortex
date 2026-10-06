import {
  ApiManager,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  isNetworkEVM,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { getFundingAccount } from "../../../../../controllers/subsidize.controller";
import { PhaseError } from "../../../../../errors/phase-error";
import { calculatePostSwapSubsidyComponents } from "../../../../phases/helpers/post-swap-subsidy-breakdown";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { EvmSubsidyTopUpExecutor } from "../../core/evm-subsidy-top-up";
import { getBlockMetadata } from "../../core/metadata";
import { SubsidizePostContext } from "./simulation";

// EVM slice of the production SubsidizePostSwapPhaseHandler: tops up the ephemeral's Nabla output
// token on Base until it matches the amount the next phase expects (the simulated Squid bridge
// input for BUY ramps). The substrate branch is not ported.
export class SubsidizePostSwapExecutor extends EvmSubsidyTopUpExecutor {
  public getPhaseName(): RampPhase {
    return "subsidizePostSwap";
  }

  public getMaxRetries(): number {
    return 200;
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePostContext);

    if (metadata.network === Networks.Pendulum) {
      try {
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress || !metadata.outputCurrencyId) {
          throw new Error("SubsidizePostSwapExecutor: missing Pendulum state");
        }
        const manager = ApiManager.getInstance();
        const pendulum = await manager.getApi("pendulum");
        const getBalance = async (address: string) => {
          const balance = await pendulum.api.query.tokens.accounts(address, metadata.outputCurrencyId);
          return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        };
        const current = await getBalance(substrateAddress);
        if (current.eq(0)) throw this.createRecoverableError("Swap output did not arrive on Pendulum");
        const required = new Big(metadata.targetOutputAmountRaw).minus(current);
        if (required.gt(0)) {
          const funding = getFundingAccount();
          const available = await getBalance(funding.address);
          if (available.lt(required)) throw this.createUnrecoverableError("Pendulum post-swap funding balance too low");
          const result = await this.runFinancialOperation(state, {
            attemptClass: "substrate-subsidy-transfer",
            externalId: operation => operation.hash,
            perform: async () => {
              throwIfAborted(signal);
              const sent = await abortableCall(signal, () =>
                manager.executeApiCall(
                  api => api.tx.tokens.transfer(substrateAddress, metadata.outputCurrencyId, required.toFixed(0, 0)),
                  funding,
                  "pendulum"
                )
              );
              await waitUntilTrueWithTimeout(
                async () => (await getBalance(substrateAddress)).gte(metadata.targetOutputAmountRaw),
                2000,
                180000,
                signal
              );
              return { hash: sent.hash };
            },
            provider: Networks.Pendulum,
            request: {
              amountRaw: required.toFixed(0, 0),
              currencyId: metadata.outputCurrencyId,
              destination: substrateAddress,
              source: funding.address
            },
            signal
          });
          await this.createSubsidy(
            state,
            nativeToDecimal(required, metadata.outputDecimals).toNumber(),
            metadata.outputCurrency as SubsidyToken,
            funding.address,
            result.hash
          );
        }
        return state;
      } catch (e) {
        logger.error("Error in subsidizePostSwap (Pendulum):", e);
        if (e instanceof PhaseError) throw e;
        throw this.createRecoverableError("SubsidizePostSwapExecutor: Failed to subsidize post swap on Pendulum.");
      }
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePostSwapExecutor: State metadata corrupted. This is a bug.");
    }

    try {
      const outputToken = metadata.outputCurrency as EvmToken;
      const outputNetwork = (metadata.network ?? Networks.Base) as Networks;
      if (!isNetworkEVM(outputNetwork)) {
        throw new Error(`SubsidizePostSwapExecutor: Unsupported EVM network ${outputNetwork}`);
      }
      const outputTokenDetails = getOnChainTokenDetails(outputNetwork, outputToken) as EvmTokenDetails;
      if (!outputTokenDetails) {
        throw new Error(
          `Could not find token details for output token ${outputToken} on network ${outputNetwork}. Invalid quote metadata.`
        );
      }

      // For BUY operations, top up to the simulated Squid bridge input; for SELL, to the
      // simulated Nabla output.
      const expectedSwapOutputAmountRaw = Big(metadata.targetOutputAmountRaw);

      await this.topUpEvmEphemeral({
        assess: currentBalance => {
          const subsidyComponents = calculatePostSwapSubsidyComponents({
            currentBalanceRaw: currentBalance,
            discountSubsidyAmountRaw: String(metadata.subsidyAmountInOutputTokenRaw),
            expectedOutputAmountRaw: expectedSwapOutputAmountRaw,
            quotedActualOutputAmountRaw: String(metadata.actualOutputAmountRaw)
          });
          return {
            enforceCaps: async () => {
              const quoteOutputUsd = await priceFeedService.convertCurrency(
                quote.outputAmount,
                quote.outputCurrency as RampCurrency,
                EvmToken.USDC as RampCurrency
              );
              const discrepancyRaw = subsidyComponents.discrepancyAmountRaw;
              const discountRaw = subsidyComponents.discountAmountRaw;
              const discrepancyUsd = discrepancyRaw.gt(0)
                ? await priceFeedService.convertCurrency(
                    nativeToDecimal(discrepancyRaw, metadata.outputDecimals).toString(),
                    outputToken as RampCurrency,
                    EvmToken.USDC as RampCurrency
                  )
                : "0";
              const discountUsd = discountRaw.gt(0)
                ? await priceFeedService.convertCurrency(
                    nativeToDecimal(discountRaw, metadata.outputDecimals).toString(),
                    outputToken as RampCurrency,
                    EvmToken.USDC as RampCurrency
                  )
                : "0";
              const discrepancyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
              const discrepancyPercentageCap = Big(quoteOutputUsd).mul(discrepancyCapFraction);
              const discrepancyCapUsd = discrepancyPercentageCap.gt("1") ? discrepancyPercentageCap : Big("1");
              if (Big(discrepancyUsd).gt(discrepancyCapUsd)) {
                throw this.createRecoverableError(
                  `SubsidizePostSwapExecutor: Required swap discrepancy subsidy $${discrepancyUsd} exceeds cap $${discrepancyCapUsd.toFixed(2)} (max of $1.00 and ${discrepancyCapFraction} of quote output $${quoteOutputUsd}).`
                );
              }
              const discountCapFraction = config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction;
              const discountCapUsd = Big(quoteOutputUsd).mul(discountCapFraction);
              if (Big(discountUsd).gte(1) && Big(discountUsd).gt(discountCapUsd)) {
                throw this.createRecoverableError(
                  `SubsidizePostSwapExecutor: Required discount subsidy $${discountUsd} exceeds cap $${discountCapUsd.toFixed(2)} (${discountCapFraction} of quote output $${quoteOutputUsd}).`
                );
              }
            },
            requiredAmountRaw: subsidyComponents.requiredAmountRaw
          };
        },
        decimals: metadata.outputDecimals,
        ephemeralAddress: evmEphemeralAddress,
        executorName: "SubsidizePostSwapExecutor",
        label: "post-swap",
        signal,
        state,
        subsidyToken: metadata.outputCurrency as unknown as SubsidyToken,
        targetRaw: expectedSwapOutputAmountRaw,
        tokenDetails: outputTokenDetails
      });

      return state;
    } catch (e) {
      logger.error("Error in subsidizePostSwap (EVM):", e);
      if (e instanceof PhaseError) {
        throw e;
      }
      throw this.createRecoverableError("SubsidizePostSwapExecutor: Failed to subsidize post swap on EVM.");
    }
  }
}
