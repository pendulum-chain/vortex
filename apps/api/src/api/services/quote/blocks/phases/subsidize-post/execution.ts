import {
  ApiManager,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { getFundingAccount } from "../../../../../controllers/subsidize.controller";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { calculatePostSwapSubsidyComponents } from "../../../../phases/helpers/post-swap-subsidy-breakdown";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { getBlockMetadata } from "../../core/metadata";
import { SubsidizePostContext } from "./simulation";

const EVM_SETTLEMENT_DELAY_MS = parseInt(process.env.SUBSIDY_SETTLEMENT_DELAY_MS || "15000", 10);

// EVM slice of the production SubsidizePostSwapPhaseHandler: tops up the ephemeral's Nabla output
// token on Base until it matches the amount the next phase expects (the simulated Squid bridge
// input for BUY ramps). The substrate branch is not ported.
export class SubsidizePostSwapExecutor extends BasePhaseHandler {
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

    const metadata = getBlockMetadata(quote.metadata, SubsidizePostContext);

    if (metadata.network === Networks.Pendulum) {
      const substrateAddress = state.state.substrateEphemeralAddress;
      if (!substrateAddress || !metadata.outputCurrencyId) {
        throw new Error("SubsidizePostSwapExecutor: missing Pendulum state");
      }
      const manager = ApiManager.getInstance();
      const pendulum = await manager.getApi("pendulum");
      const balance = await pendulum.api.query.tokens.accounts(substrateAddress, metadata.outputCurrencyId);
      const current = new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
      if (current.eq(0)) throw this.createRecoverableError("Swap output did not arrive on Pendulum");
      const required = new Big(metadata.targetOutputAmountRaw).minus(current);
      if (required.gt(0)) {
        const funding = getFundingAccount();
        const fundingBalance = await pendulum.api.query.tokens.accounts(funding.address, metadata.outputCurrencyId);
        const available = new Big((fundingBalance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        if (available.lt(required)) throw this.createUnrecoverableError("Pendulum post-swap funding balance too low");
        const result = await manager.executeApiCall(
          api => api.tx.tokens.transfer(substrateAddress, metadata.outputCurrencyId, required.toFixed(0, 0)),
          funding,
          "pendulum"
        );
        await this.createSubsidy(
          state,
          nativeToDecimal(required, metadata.outputDecimals).toNumber(),
          metadata.outputCurrency as SubsidyToken,
          funding.address,
          result.hash
        );
      }
      return state;
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePostSwapExecutor: State metadata corrupted. This is a bug.");
    }

    try {
      const outputToken = metadata.outputCurrency as EvmToken;

      const outputTokenDetails = getOnChainTokenDetails(Networks.Base, outputToken) as EvmTokenDetails;
      if (!outputTokenDetails) {
        throw new Error(
          `Could not find token details for output token ${outputToken} on network ${Networks.Base}. Invalid quote metadata.`
        );
      }

      // Wait for token settlement before checking balance
      await new Promise(resolve => setTimeout(resolve, EVM_SETTLEMENT_DELAY_MS));

      const currentBalance = await checkEvmBalanceForToken({
        amountDesiredRaw: "1",
        chain: outputTokenDetails.network as EvmNetworks,
        intervalMs: 1000,
        ownerAddress: evmEphemeralAddress,
        timeoutMs: 5000,
        tokenDetails: outputTokenDetails
      });

      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on EVM");
      }

      // For BUY operations, top up to the simulated Squid bridge input; for SELL, to the
      // simulated Nabla output.
      const expectedSwapOutputAmountRaw = Big(metadata.targetOutputAmountRaw);

      const subsidyComponents =
        state.type === RampDirection.SELL
          ? calculatePostSwapSubsidyComponents({
              currentBalanceRaw: currentBalance,
              discountSubsidyAmountRaw: String(metadata.subsidyAmountInOutputTokenRaw),
              expectedOutputAmountRaw: expectedSwapOutputAmountRaw,
              quotedActualOutputAmountRaw: String(metadata.actualOutputAmountRaw)
            })
          : undefined;
      const requiredAmount = subsidyComponents?.requiredAmountRaw ?? Big(expectedSwapOutputAmountRaw).sub(currentBalance);
      logger.debug(`SubsidizePostSwapExecutor: requiredAmount ${requiredAmount.toString()}`);

      if (requiredAmount.gt(Big(0))) {
        const quoteOutputUsd = await priceFeedService.convertCurrency(
          quote.outputAmount,
          quote.outputCurrency as RampCurrency,
          EvmToken.USDC as RampCurrency
        );
        const discrepancyRaw = subsidyComponents?.discrepancyAmountRaw ?? requiredAmount;
        const discountRaw = subsidyComponents?.discountAmountRaw ?? Big(0);
        const [discrepancyUsd, discountUsd] = await Promise.all([
          priceFeedService.convertCurrency(
            nativeToDecimal(discrepancyRaw, metadata.outputDecimals).toString(),
            outputToken as RampCurrency,
            EvmToken.USDC as RampCurrency
          ),
          priceFeedService.convertCurrency(
            nativeToDecimal(discountRaw, metadata.outputDecimals).toString(),
            outputToken as RampCurrency,
            EvmToken.USDC as RampCurrency
          )
        ]);
        const discrepancyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
        const discrepancyPercentageCap = Big(quoteOutputUsd).mul(discrepancyCapFraction);
        const discrepancyCapUsd = discrepancyPercentageCap.gt("1") ? discrepancyPercentageCap : Big("1");
        if (Big(discrepancyUsd).gt(discrepancyCapUsd)) {
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePostSwapExecutor: Required swap discrepancy subsidy $${discrepancyUsd} exceeds cap $${discrepancyCapUsd.toFixed(2)} (max of $1.00 and ${discrepancyCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }
        const discountCapFraction = config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction;
        const discountCapUsd = Big(quoteOutputUsd).mul(discountCapFraction);
        if (Big(discountUsd).gt(discountCapUsd)) {
          throw this.createRecoverableError(
            `SubsidizePostSwapExecutor: Required discount subsidy $${discountUsd} exceeds cap $${discountCapUsd.toFixed(2)} (${discountCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }

        logger.info(
          `Subsidizing post-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedSwapOutputAmountRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const destinationNetwork = outputTokenDetails.network as EvmNetworks;
        const fundingAccount = getEvmFundingAccount(destinationNetwork);

        const publicClient = evmClientManager.getClient(destinationNetwork);
        const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

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

        const subsidyAmount = nativeToDecimal(requiredAmount, metadata.outputDecimals).toNumber();
        const subsidyToken = metadata.outputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SubsidizePostSwapExecutor: Subsidy transaction ${txHash} failed or was not found`);
        }
      }

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
