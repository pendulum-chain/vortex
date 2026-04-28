import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  Networks,
  nativeToDecimal,
  RampDirection,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class SubsidizePostSwapEvmPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePostSwapEvm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePostSwapEvmPhaseHandler: State metadata corrupted. This is a bug.");
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

      logger.debug(`SubsidizePostSwapEvmHandler: expectedSwapOutputAmountRaw ${expectedSwapOutputAmountRaw.toString()}`);

      // Try to find the required amount to subsidize on the quote metadata
      if (state.type === RampDirection.BUY) {
        // For BUY operations, use the evmToEvm inputAmountRaw as the expected amount
        expectedSwapOutputAmountRaw = Big(quote.metadata.evmToEvm?.inputAmountRaw);
      } else {
        expectedSwapOutputAmountRaw = Big(quote.metadata.nablaSwapEvm.outputAmountRaw);
      }

      const requiredAmount = Big(expectedSwapOutputAmountRaw).sub(currentBalance);
      logger.debug(`SubsidizePostSwapEvmHandler: requiredAmount ${requiredAmount.toString()}`);

      const didBalanceReachExpected = async () => {
        const balance = await checkEvmBalanceForToken({
          amountDesiredRaw: expectedSwapOutputAmountRaw.toString(),
          chain: outputTokenDetails.network as EvmNetworks,
          intervalMs: 1000,
          ownerAddress: evmEphemeralAddress,
          timeoutMs: 5000,
          tokenDetails: outputTokenDetails
        });
        return balance.gte(expectedSwapOutputAmountRaw);
      };

      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing on EVM
        logger.info(
          `Subsidizing post-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedSwapOutputAmountRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
        const destinationNetwork = outputTokenDetails.network as EvmNetworks;

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

        // Wait for the balance to update
        await waitUntilTrueWithTimeout(didBalanceReachExpected, 2000);
      }

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state, quote));
    } catch (e) {
      logger.error("Error in subsidizePostSwapEvm:", e);
      throw this.createRecoverableError("SubsidizePostSwapEvmPhaseHandler: Failed to subsidize post swap on EVM.");
    }
  }

  protected nextPhaseSelector(state: RampState, quote: QuoteTicket): RampPhase {
    if (state.type === RampDirection.BUY) {
      return "squidRouterSwap";
    } else {
      return "brlaPayoutOnBase";
    }
  }
}

export default new SubsidizePostSwapEvmPhaseHandler();
