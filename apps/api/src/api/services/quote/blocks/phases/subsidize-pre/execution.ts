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
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import { Big } from "big.js";
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
import { SubsidizePreContext } from "./simulation";

// EVM slice of the production SubsidizePreSwapPhaseHandler: tops up the ephemeral's Nabla input
// token on Base until it matches the simulated swap input. Substrate and Alfredpay branches are
// not ported.
export class SubsidizePreSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
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
      throw new Error("SubsidizePreSwapExecutor: State metadata corrupted. This is a bug.");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePreContext);

    try {
      const inputToken = metadata.inputCurrency as EvmToken;
      const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inputToken) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error(
          `Could not find token details for input token ${inputToken} on network ${Networks.Base}. Invalid quote metadata.`
        );
      }
      const expectedInputAmountForSwapRaw = metadata.targetInputAmountRaw;

      // Wait for token settlement before checking balance
      await new Promise(resolve => setTimeout(resolve, 15000));

      const currentBalance = await checkEvmBalanceForToken({
        amountDesiredRaw: "1",
        chain: inputTokenDetails.network as EvmNetworks,
        intervalMs: 1000,
        ownerAddress: evmEphemeralAddress,
        timeoutMs: 5000,
        tokenDetails: inputTokenDetails
      });

      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on EVM");
      }

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
      logger.debug(`SubsidizePreSwapExecutor: requiredAmount ${requiredAmount.toString()}`);

      if (requiredAmount.gt(Big(0))) {
        const subsidyDecimal = nativeToDecimal(requiredAmount, metadata.inputDecimals).toString();
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
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePreSwapExecutor: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (max of $1.00 and ${subsidyCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }

        logger.info(
          `Subsidizing pre-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const destinationNetwork = inputTokenDetails.network as EvmNetworks;
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
          to: inputTokenDetails.erc20AddressSourceChain as `0x${string}`,
          value: 0n
        });

        const subsidyAmount = nativeToDecimal(requiredAmount, metadata.inputDecimals).toNumber();
        const subsidyToken = metadata.inputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SubsidizePreSwapExecutor: Subsidy transaction ${txHash} failed or was not found`);
        }
      }

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
