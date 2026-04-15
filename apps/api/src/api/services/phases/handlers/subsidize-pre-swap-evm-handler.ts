import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  Networks,
  nativeToDecimal,
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

export class SubsidizePreSwapEvmPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwapEvm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePreSwapEvmPhaseHandler: State metadata corrupted. This is a bug.");
    }

    if (!quote.metadata.nablaSwapEvm) {
      throw new Error("Missing nablaSwapEvm information in quote metadata");
    }

    try {
      // Get token details for the input token
      const inputToken = quote.metadata.nablaSwapEvm.inputCurrency as EvmToken;

      const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inputToken) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error(
          `Could not find token details for input token ${inputToken} on network ${Networks.Base}. Invalid quote metadata.`
        );
      }

      // Check current balance on EVM
      const currentBalance = await checkEvmBalanceForToken({
        amountDesiredRaw: "1",
        chain: inputTokenDetails.network as EvmNetworks,
        intervalMs: 1000, // Just check if there's any balance
        ownerAddress: evmEphemeralAddress,
        timeoutMs: 5000,
        tokenDetails: inputTokenDetails
      });

      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on EVM");
      }

      const expectedInputAmountForSwapRaw = quote.metadata.nablaSwapEvm.inputAmountForSwapRaw;

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
      console.log("debug: requiredAmount", requiredAmount.toString());

      const didBalanceReachExpected = async () => {
        const balance = await checkEvmBalanceForToken({
          amountDesiredRaw: expectedInputAmountForSwapRaw.toString(),
          chain: inputTokenDetails.network as EvmNetworks,
          intervalMs: 1000,
          ownerAddress: evmEphemeralAddress,
          timeoutMs: 5000,
          tokenDetails: inputTokenDetails
        });
        return balance.gte(Big(expectedInputAmountForSwapRaw));
      };

      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing on EVM
        logger.info(
          `Subsidizing pre-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
        const destinationNetwork = inputTokenDetails.network as EvmNetworks;

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
          to: inputTokenDetails.erc20AddressSourceChain as `0x${string}`,
          value: 0n
        });

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwapEvm.inputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwapEvm.inputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);

        // Wait for the balance to update
        await waitUntilTrueWithTimeout(didBalanceReachExpected, 2000);
      }

      return this.transitionToNextPhase(state, "nablaApprove");
    } catch (e) {
      logger.error("Error in subsidizePreSwapEvm:", e);
      throw this.createRecoverableError("SubsidizePreSwapEvmPhaseHandler: Failed to subsidize pre swap on EVM.");
    }
  }
}

export default new SubsidizePreSwapEvmPhaseHandler();
