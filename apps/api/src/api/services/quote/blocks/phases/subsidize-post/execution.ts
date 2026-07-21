import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
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

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePostSwapExecutor: State metadata corrupted. This is a bug.");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePostContext);

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

      const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);
      logger.debug(`SubsidizePostSwapExecutor: requiredAmount ${requiredAmount.toString()}`);

      if (requiredAmount.gt(Big(0))) {
        const subsidyDecimal = nativeToDecimal(requiredAmount, metadata.outputDecimals).toString();
        const subsidyUsd = await priceFeedService.convertCurrency(
          subsidyDecimal,
          outputToken as RampCurrency,
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
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePostSwapExecutor: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (max of $1.00 and ${subsidyCapFraction} of quote output $${quoteOutputUsd}).`
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
