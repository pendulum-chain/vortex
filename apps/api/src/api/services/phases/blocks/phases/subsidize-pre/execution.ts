import {
  ApiManager,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  getPendulumDetails,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import { Big } from "big.js";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { getFundingAccount } from "../../../../../controllers/subsidize.controller";
import { PhaseError } from "../../../../../errors/phase-error";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { EvmSubsidyTopUpExecutor } from "../../core/evm-subsidy-top-up";
import { getBlockMetadata } from "../../core/metadata";
import { SubsidizePreContext } from "./simulation";

export class SubsidizePreSwapExecutor extends EvmSubsidyTopUpExecutor {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
  }

  public getMaxRetries(): number {
    return 200;
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePreContext);

    if (metadata.network === Networks.Pendulum) {
      try {
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress) throw new Error("SubsidizePreSwapExecutor: missing Substrate ephemeral");
        const manager = ApiManager.getInstance();
        const pendulum = await manager.getApi("pendulum");
        const currencyId = metadata.inputCurrencyId ?? getPendulumDetails(metadata.inputCurrency as RampCurrency).currencyId;
        const getBalance = async (address: string) => {
          const balance = await pendulum.api.query.tokens.accounts(address, currencyId);
          return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        };
        const current = await getBalance(substrateAddress);
        if (current.eq(0)) throw this.createRecoverableError("Input token did not arrive on Pendulum");
        const required = new Big(metadata.targetInputAmountRaw).minus(current);
        if (required.gt(0)) {
          const funding = getFundingAccount();
          const available = await getBalance(funding.address);
          if (available.lt(required)) throw this.createUnrecoverableError("Pendulum pre-swap funding balance too low");
          const result = await this.runFinancialOperation(state, {
            attemptClass: "substrate-subsidy-transfer",
            externalId: operation => operation.hash,
            perform: async () => {
              throwIfAborted(signal);
              const sent = await abortableCall(signal, () =>
                manager.executeApiCall(
                  api => api.tx.tokens.transfer(substrateAddress, currencyId, required.toFixed(0, 0)),
                  funding,
                  "pendulum"
                )
              );
              await waitUntilTrueWithTimeout(
                async () => (await getBalance(substrateAddress)).gte(metadata.targetInputAmountRaw),
                5000,
                180000,
                signal
              );
              return { hash: sent.hash };
            },
            provider: Networks.Pendulum,
            request: {
              amountRaw: required.toFixed(0, 0),
              currencyId,
              destination: substrateAddress,
              source: funding.address
            },
            signal
          });
          await this.createSubsidy(
            state,
            nativeToDecimal(required, metadata.inputDecimals).toNumber(),
            metadata.inputCurrency as SubsidyToken,
            funding.address,
            result.hash
          );
        }
        return state;
      } catch (e) {
        logger.error("Error in subsidizePreSwap (Pendulum):", e);
        if (e instanceof PhaseError) throw e;
        throw this.createRecoverableError("SubsidizePreSwapExecutor: Failed to subsidize pre swap on Pendulum.");
      }
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePreSwapExecutor: State metadata corrupted. This is a bug.");
    }

    try {
      const inputToken = metadata.inputCurrency as EvmToken;
      const inputNetwork = metadata.network as Networks;
      const inputTokenDetails = getOnChainTokenDetails(inputNetwork, inputToken) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error(
          `Could not find token details for input token ${inputToken} on network ${inputNetwork}. Invalid quote metadata.`
        );
      }
      // The swap consumes targetInputAmountRaw; feeReserveRaw (Alfredpay corridors)
      // additionally keeps the later distributeFees transfers funded on the ephemeral.
      const targetRaw = Big(
        Big(metadata.targetInputAmountRaw)
          .plus(metadata.feeReserveRaw ?? "0")
          .toFixed(0)
      );

      await this.topUpEvmEphemeral({
        assess: currentBalance => ({
          enforceCaps: async maximumTransferAmount => {
            const subsidyDecimal = nativeToDecimal(maximumTransferAmount, metadata.inputDecimals).toString();
            const subsidyUsd = await priceFeedService.convertCurrency(
              subsidyDecimal,
              inputToken as RampCurrency,
              EvmToken.USDC as RampCurrency
            );
            const quoteOutputUsd = await priceFeedService.convertCurrency(
              quote.outputAmount,
              quote.outputCurrency as RampCurrency,
              EvmToken.USDC as RampCurrency
            );
            const subsidyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
            const percentageCap = Big(quoteOutputUsd).mul(subsidyCapFraction);
            const subsidyCapUsd = percentageCap.gt("1") ? percentageCap : Big("1");
            if (Big(subsidyUsd).gt(subsidyCapUsd)) {
              throw this.createRecoverableError(
                `SubsidizePreSwapExecutor: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (max of $1.00 and ${subsidyCapFraction} of quote output $${quoteOutputUsd}).`
              );
            }
          },
          requiredAmountRaw: targetRaw.sub(currentBalance)
        }),
        decimals: metadata.inputDecimals,
        ephemeralAddress: evmEphemeralAddress,
        executorName: "SubsidizePreSwapExecutor",
        label: "pre-swap",
        signal,
        state,
        subsidyToken: metadata.inputCurrency as unknown as SubsidyToken,
        targetRaw,
        tokenDetails: inputTokenDetails
      });

      return state;
    } catch (e) {
      logger.error("Error in subsidizePreSwap (EVM):", e);
      if (e instanceof PhaseError) {
        throw e;
      }
      throw this.createRecoverableError("SubsidizePreSwapExecutor: Failed to subsidize pre swap on EVM.");
    }
  }
}
