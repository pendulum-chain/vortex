import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  ApiManager,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  getOnChainTokenDetails,
  isAlfredpayToken,
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
import { MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { PhaseError } from "../../../errors/phase-error";
import { priceFeedService } from "../../priceFeed.service";
import { BasePhaseHandler } from "../base-phase-handler";
import { getEvmFundingAccount } from "../evm-funding";
import { StateMetadata } from "../meta-state-types";

export class SubsidizePreSwapPhaseHandler extends BasePhaseHandler {
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

    if (quote.inputCurrency === FiatToken.BRL || quote.outputCurrency === FiatToken.BRL) {
      return this.executeEvmSubsidize(state, quote);
    }

    if (state.type === RampDirection.BUY && isAlfredpayToken(quote.inputCurrency as FiatToken)) {
      return this.executeEvmSubsidize(state, quote);
    }

    return this.executeSubstrateSubsidize(state, quote);
  }

  private getEvmSubsidyConfig(state: RampState, quote: QuoteTicket) {
    if (state.type === RampDirection.BUY && isAlfredpayToken(quote.inputCurrency as FiatToken)) {
      if (!quote.metadata.evmToEvm) {
        throw new Error("Missing evmToEvm information in quote metadata");
      }

      const inputTokenDetails = getOnChainTokenDetails(Networks.Polygon, EvmToken.USDT) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error("Could not find token details for USDT on Polygon. Invalid quote metadata.");
      }

      return {
        expectedInputAmountForSwapRaw: quote.metadata.evmToEvm.inputAmountRaw,
        inputAmountDecimals: ALFREDPAY_ERC20_DECIMALS, // TODO no need to keep this constant, let's identify simply by token/chain itself.
        inputToken: EvmToken.USDT,
        inputTokenDetails,
        logLabel: "Alfredpay",
        nextPhase: "squidRouterSwap" as RampPhase,
        subsidyToken: EvmToken.USDT as unknown as SubsidyToken,
        tokenContract: ALFREDPAY_ERC20_TOKEN
      };
    }

    if (!quote.metadata.nablaSwapEvm) {
      throw new Error("Missing nablaSwapEvm information in quote metadata");
    }

    const inputToken = quote.metadata.nablaSwapEvm.inputCurrency as EvmToken;
    const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inputToken) as EvmTokenDetails;
    if (!inputTokenDetails) {
      throw new Error(
        `Could not find token details for input token ${inputToken} on network ${Networks.Base}. Invalid quote metadata.`
      );
    }

    return {
      expectedInputAmountForSwapRaw: quote.metadata.nablaSwapEvm.inputAmountForSwapRaw,
      inputAmountDecimals: quote.metadata.nablaSwapEvm.inputDecimals,
      inputToken,
      inputTokenDetails,
      logLabel: "EVM",
      nextPhase: "nablaApprove" as RampPhase,
      subsidyToken: quote.metadata.nablaSwapEvm.inputCurrency as unknown as SubsidyToken,
      tokenContract: inputTokenDetails.erc20AddressSourceChain as `0x${string}`
    };
  }

  private async executeSubstrateSubsidize(state: RampState, quote: QuoteTicket): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const { substrateEphemeralAddress } = state.state as StateMetadata;

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

      const balanceJson = balanceResponse.toJSON() as { free?: string | number } | null;
      const currentBalance = Big(String(balanceJson?.free ?? "0"));
      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on pendulum");
      }

      const expectedInputAmountForSwapRaw = quote.metadata.nablaSwap.inputAmountForSwapRaw;

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);

      const didBalanceReachExpected = async () => {
        const balanceResponse = await pendulumNode.api.query.tokens.accounts(
          substrateEphemeralAddress,
          quote.metadata.nablaSwap?.inputCurrencyId
        );

        const innerJson = balanceResponse.toJSON() as { free?: string | number } | null;
        const currentBalance = Big(String(innerJson?.free ?? "0"));
        return currentBalance.gte(Big(expectedInputAmountForSwapRaw));
      };

      if (requiredAmount.gt(Big(0))) {
        const fundingAccountKeypair = getFundingAccount();

        const fundingBalanceResponse = await pendulumNode.api.query.tokens.accounts(
          fundingAccountKeypair.address,
          quote.metadata.nablaSwap?.inputCurrencyId
        );
        const fundingBalanceJson = fundingBalanceResponse.toJSON() as { free?: string | number } | null;
        const fundingBalance = Big(String(fundingBalanceJson?.free ?? "0"));
        if (fundingBalance.lt(requiredAmount)) {
          throw this.createUnrecoverableError(
            `SubsidizePreSwapPhaseHandler: Funding account balance too low for subsidy: has ${fundingBalance.toFixed(0)}, needs ${requiredAmount.toFixed(0)}`
          );
        }

        logger.info(
          `Subsidizing pre-swap with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );

        const result = await apiManager.executeApiCall(
          api =>
            api.tx.tokens.transfer(
              substrateEphemeralAddress,
              quote.metadata.nablaSwap?.inputCurrencyId,
              requiredAmount.toFixed(0, 0)
            ),
          fundingAccountKeypair,
          networkName
        );

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwap.inputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwap.inputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccountKeypair.address, result.hash);

        await waitUntilTrueWithTimeout(didBalanceReachExpected, 5000);
      }

      return this.transitionToNextPhase(state, "nablaApprove");
    } catch (e) {
      logger.error("Error in subsidizePreSwap (substrate):", e);
      throw this.createRecoverableError("SubsidizePreSwapPhaseHandler: Failed to subsidize pre swap.");
    }
  }

  private async executeEvmSubsidize(state: RampState, quote: QuoteTicket): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePreSwapPhaseHandler: State metadata corrupted. This is a bug.");
    }

    try {
      const {
        inputAmountDecimals,
        inputToken,
        inputTokenDetails,
        logLabel,
        nextPhase,
        expectedInputAmountForSwapRaw,
        subsidyToken,
        tokenContract
      } = this.getEvmSubsidyConfig(state, quote);

      // Wait for token settlement before checking balance
      await new Promise(resolve => setTimeout(resolve, 15000));

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

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
      logger.debug(`SubsidizePreSwapHandler (${logLabel}): requiredAmount ${requiredAmount.toString()}`);

      console.log(
        `[SubsidizePreSwapPhaseHandler] ${logLabel} ephemeral=${evmEphemeralAddress}, expected=${expectedInputAmountForSwapRaw}, currentBalance=${currentBalance.toString()}, required=${requiredAmount.toString()}`
      );

      if (requiredAmount.gt(Big(0))) {
        const subsidyDecimal = nativeToDecimal(requiredAmount, inputAmountDecimals).toString();
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
        const subsidyCapUsd = Big(quoteOutputUsd).mul(MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION);
        if (Big(subsidyUsd).gt(subsidyCapUsd)) {
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePreSwapPhaseHandler: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (${MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION} of quote output $${quoteOutputUsd}).`
          );
        }

        // Do the actual subsidizing on EVM
        logger.info(
          `Subsidizing pre-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const destinationNetwork = inputTokenDetails.network as EvmNetworks;
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
          to: tokenContract,
          value: 0n
        });

        const subsidyAmount = nativeToDecimal(requiredAmount, inputAmountDecimals).toNumber();

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SubsidizePreSwapPhaseHandler: Subsidy transaction ${txHash} failed or was not found`);
        }
      }

      return this.transitionToNextPhase(state, nextPhase);
    } catch (e) {
      logger.error("Error in subsidizePreSwap (EVM):", e);
      if (e instanceof PhaseError) {
        throw e;
      }
      throw this.createRecoverableError("SubsidizePreSwapPhaseHandler: Failed to subsidize pre swap on EVM.");
    }
  }
}

export default new SubsidizePreSwapPhaseHandler();
