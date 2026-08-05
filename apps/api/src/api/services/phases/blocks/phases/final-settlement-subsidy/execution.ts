import {
  ALFREDPAY_EVM_TOKEN,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getEvmBalance,
  getNetworkId,
  getOnChainTokenDetails,
  getRoute,
  isNativeEvmToken,
  multiplyByPowerOfTen,
  NATIVE_TOKEN_ADDRESS,
  Networks,
  RampCurrency,
  RampDirection,
  RampPhase,
  TokenType
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import logger from "../../../../../../config/logger";
import { MAX_FINAL_SETTLEMENT_SUBSIDY_USD } from "../../../../../../constants/constants";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import type { SquidRouterDeliveryEvidence } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { calculatePresignedGasBudgetRaw } from "../../core/evm-destination-gas";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { calculateSettlementSubsidyRaw, settlementBalanceKey } from "../../core/settlement";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
// This is an explicitly scoped fallback for Squid-routed EVM delivery. It is not
// authoritative bridge finality and MUST NOT be reused as a global cross-chain rule.
const SQUID_EVM_DELIVERY_FALLBACK_MIN_RATIO_BPS = 9000;

const NATIVE_TOKENS: Record<EvmNetworks, { symbol: string; decimals: number }> = {
  [Networks.Ethereum]: { decimals: 18, symbol: "ETH" },
  [Networks.Polygon]: { decimals: 18, symbol: "MATIC" },
  [Networks.PolygonAmoy]: { decimals: 18, symbol: "MATIC" },
  [Networks.BSC]: { decimals: 18, symbol: "BNB" },
  [Networks.Arbitrum]: { decimals: 18, symbol: "ETH" },
  [Networks.Base]: { decimals: 18, symbol: "ETH" },
  [Networks.Avalanche]: { decimals: 18, symbol: "AVAX" },
  [Networks.Moonbeam]: { decimals: 18, symbol: "GLMR" },
  [Networks.BaseSepolia]: { decimals: 18, symbol: "ETH" }
};

// BUY slice of the production FinalSettlementSubsidyHandler: waits for the bridge to deliver on
// the destination chain, then tops the ephemeral up to exactly quote.outputAmount (swapping the
// funding account's native token to the output token via SquidRouter when needed). SELL is not ported.
export class FinalSettlementSubsidyExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "finalSettlementSubsidy";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    logger.debug(`FinalSettlementSubsidyExecutor: Starting phase execution for ramp ${state.id}, type=${state.type}`);

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("FinalSettlementSubsidyExecutor: Quote not found for the given state");
    }

    const evmClientManager = EvmClientManager.getInstance();

    const alfredpayMetadata = (quote.metadata as unknown as { blocks?: { alfredpayOfframp?: { inputAmountRaw: string } } })
      .blocks?.alfredpayOfframp;
    const isAlfredpayOfframp = state.type === RampDirection.SELL && alfredpayMetadata !== undefined;
    const outputNetwork = isAlfredpayOfframp ? Networks.Polygon : quote.network;
    const outputCurrency = isAlfredpayOfframp ? ALFREDPAY_EVM_TOKEN : quote.outputCurrency;
    const outTokenDetailsRaw = getOnChainTokenDetails(outputNetwork, outputCurrency);
    if (!outTokenDetailsRaw || outTokenDetailsRaw.type === TokenType.AssetHub) {
      throw new Error("FinalSettlementSubsidyExecutor: Output currency is not an EVM token");
    }
    const outTokenDetails = outTokenDetailsRaw as EvmTokenDetails;

    const isNative = isNativeEvmToken(outTokenDetails);
    const expectedAmountRaw = isAlfredpayOfframp
      ? new Big(alfredpayMetadata.inputAmountRaw)
      : multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals);
    const destinationNetwork = outputNetwork as EvmNetworks;
    const fundingAccount = getEvmFundingAccount(destinationNetwork);
    const publicClient = evmClientManager.getClient(destinationNetwork);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;

    logger.debug(
      `FinalSettlementSubsidyExecutor: expectedAmountRaw=${expectedAmountRaw.toString()}, destinationNetwork=${destinationNetwork}, ephemeralAddress=${ephemeralAddress}, isNative=${isNative}`
    );

    // 1. Idempotency check
    if (state.state.finalSettlementSubsidyTxHash) {
      const receipt = await abortableCall(signal, () =>
        publicClient.getTransactionReceipt({
          hash: state.state.finalSettlementSubsidyTxHash as `0x${string}`
        })
      ).catch(() => null);

      if (receipt && receipt.status === "success") {
        logger.info(
          `FinalSettlementSubsidyExecutor: Transaction ${state.state.finalSettlementSubsidyTxHash} already successful. Skipping.`
        );
        return state;
      }
      if (receipt) {
        throw this.createUnrecoverableError(
          `FinalSettlementSubsidyExecutor: Persisted subsidy transaction ${state.state.finalSettlementSubsidyTxHash} failed`
        );
      }
      throw this.createRecoverableError(
        `FinalSettlementSubsidyExecutor: Cannot reconcile persisted subsidy transaction ${state.state.finalSettlementSubsidyTxHash}`
      );
    }

    const baselineKey = settlementBalanceKey(destinationNetwork, ephemeralAddress, outTokenDetails.erc20AddressSourceChain);
    const baselineValue =
      state.state.transactionPlan?.settlementBaselines?.[baselineKey] ?? (isAlfredpayOfframp ? "0" : undefined);
    if (baselineValue === undefined) {
      throw this.createUnrecoverableError("FinalSettlementSubsidyExecutor: Missing destination settlement baseline");
    }
    const baseline = new Big(baselineValue);
    const squidMetadata = (
      quote.metadata as unknown as {
        blocks?: {
          squidRouterSwap?: {
            outputAmountRaw: string;
            toNetwork: EvmNetworks;
            toToken: string;
          };
        };
      }
    ).blocks?.squidRouterSwap;
    const bridgeExpectedAmountRaw = squidMetadata?.outputAmountRaw ?? expectedAmountRaw.toFixed(0);
    const existingEvidence = state.state.squidRouterDeliveryEvidence;
    if (existingEvidence) {
      this.assertMatchingDeliveryEvidence(
        existingEvidence,
        destinationNetwork,
        outTokenDetails.erc20AddressSourceChain,
        bridgeExpectedAmountRaw,
        baselineValue,
        state
      );
    }

    // 2. Wait for the route-scoped bridge delivery delta, excluding any balance that
    // existed before the bridge. Provider-terminal evidence is preferred. The 90%
    // threshold remains only as the EVM balance fallback selected for provider-indexing
    // gaps, and is persisted/logged as heuristic evidence rather than called finality.
    const minimumBridgeDeliveryRaw = new Big(bridgeExpectedAmountRaw)
      .mul(SQUID_EVM_DELIVERY_FALLBACK_MIN_RATIO_BPS)
      .div(10_000)
      .toFixed(0, 0);
    const actualBalance = await checkEvmBalanceForToken({
      amountDesiredRaw: baseline.plus(minimumBridgeDeliveryRaw).toFixed(0),
      chain: destinationNetwork,
      intervalMs: BALANCE_POLLING_TIME_MS,
      ownerAddress: ephemeralAddress,
      signal,
      timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
      tokenDetails: outTokenDetails
    });
    logger.debug(`FinalSettlementSubsidyExecutor: Ephemeral balance=${actualBalance.toString()}`);
    if (!existingEvidence) {
      const sourceTransactionHash =
        state.state.squidRouterSwapHash ?? state.state.squidRouterPermitExecutionHash ?? "legacy-unavailable";
      const fallbackEvidence: SquidRouterDeliveryEvidence = {
        baselineRaw: baselineValue,
        destinationNetwork,
        destinationToken: outTokenDetails.erc20AddressSourceChain,
        expectedAmountRaw: bridgeExpectedAmountRaw,
        kind: "destination-balance",
        minimumRatioBps: SQUID_EVM_DELIVERY_FALLBACK_MIN_RATIO_BPS,
        observedAt: new Date().toISOString(),
        observedBalanceRaw: actualBalance.toFixed(0),
        sourceTransactionHash
      };
      await state.update({
        state: {
          ...state.state,
          squidRouterDeliveryEvidence: fallbackEvidence
        }
      });
      logger.warn("SQUIDROUTER_DELIVERY_BALANCE_FALLBACK", {
        destinationNetwork,
        expectedAmountRaw: bridgeExpectedAmountRaw,
        minimumRatioBps: SQUID_EVM_DELIVERY_FALLBACK_MIN_RATIO_BPS,
        rampId: state.id,
        sourceTransactionHash
      });
    } else {
      logger.info("SQUIDROUTER_SETTLEMENT_EVIDENCE_ACCEPTED", {
        kind: existingEvidence.kind,
        provider: existingEvidence.provider,
        rampId: state.id,
        sourceTransactionHash: existingEvidence.sourceTransactionHash
      });
    }

    // 3. Check funding account balance
    const actualBalanceFundingAccount = await getEvmBalance({
      chain: destinationNetwork,
      ownerAddress: fundingAccount.address as `0x${string}`,
      tokenDetails: outTokenDetails
    });

    let destinationGasReserveRaw = new Big(0);
    if (isNative) {
      destinationGasReserveRaw = new Big(
        calculatePresignedGasBudgetRaw(
          this.getPresignedTransaction(state, "destinationTransfer").txData as `0x${string}`
        ).toString()
      );
    }
    const requiredBalanceRaw = expectedAmountRaw.plus(destinationGasReserveRaw);
    const subsidyAmountRaw = calculateSettlementSubsidyRaw(
      expectedAmountRaw,
      actualBalance,
      baseline,
      destinationGasReserveRaw
    );
    logger.debug(
      `FinalSettlementSubsidyExecutor: subsidyAmountRaw=${subsidyAmountRaw.toString()} (required=${requiredBalanceRaw.toString()} - actualBalance=${actualBalance.toString()})`
    );

    if (subsidyAmountRaw.lte(0)) {
      logger.info(
        `FinalSettlementSubsidyExecutor: Actual balance ${actualBalance.toString()} meets required balance ${requiredBalanceRaw.toString()}. No subsidy needed.`
      );
      return state;
    }

    const subsidyAmountDecimal = subsidyAmountRaw.div(new Big(10).pow(outTokenDetails.decimals));
    const subsidyAmountUsd = await priceFeedService.convertCurrency(
      subsidyAmountDecimal.toFixed(),
      outTokenDetails.assetSymbol as RampCurrency,
      "USD" as RampCurrency
    );
    if (new Big(subsidyAmountUsd).gt(MAX_FINAL_SETTLEMENT_SUBSIDY_USD)) {
      throw this.createUnrecoverableError(
        `FinalSettlementSubsidyExecutor: Required subsidy $${subsidyAmountUsd} exceeds maximum allowed $${MAX_FINAL_SETTLEMENT_SUBSIDY_USD}`
      );
    }

    logger.info(
      `FinalSettlementSubsidyExecutor: Subsidizing ${subsidyAmountRaw.toString()} raw units of ${isNative ? "native token" : outTokenDetails.assetSymbol} to ${ephemeralAddress}`
    );

    // 4. Top up funding account if insufficient balance (ERC-20 only; native tokens transfer directly)
    if (!isNative && actualBalanceFundingAccount.lt(subsidyAmountRaw)) {
      logger.info(
        `FinalSettlementSubsidyExecutor: Funding account has insufficient balance. Swapping native token to ${outTokenDetails.assetSymbol}`
      );

      const nativeToken = NATIVE_TOKENS[destinationNetwork];
      const oneUsdInNative = await priceFeedService.convertCurrency(
        "1",
        "USD" as RampCurrency,
        nativeToken.symbol as RampCurrency
      );
      const oneUsdInNativeRaw = multiplyByPowerOfTen(oneUsdInNative, nativeToken.decimals).toFixed(0);

      const chainId = getNetworkId(destinationNetwork).toString();

      // Use a placeholder address for this query to prevent rate limiting issues
      const placeholderAddress = privateKeyToAddress(generatePrivateKey());
      const testRouteResult = await getRoute(
        {
          bypassGuardrails: true,
          enableExpress: true,
          fromAddress: placeholderAddress,
          fromAmount: oneUsdInNativeRaw,
          fromChain: chainId,
          fromToken: NATIVE_TOKEN_ADDRESS,
          slippageConfig: {
            autoMode: 1
          },
          toAddress: placeholderAddress,
          toChain: chainId,
          toToken: outTokenDetails.erc20AddressSourceChain
        },
        { useCache: true }
      );

      const { route: testRoute } = testRouteResult.data;
      const rate = new Big(testRoute.estimate.toAmount).div(new Big(oneUsdInNativeRaw));
      const requiredNativeRaw = subsidyAmountRaw.div(rate).mul(1.1).toFixed(0);

      logger.info(
        `FinalSettlementSubsidyExecutor: Swapping ${requiredNativeRaw} native units (approx. rate ${rate}) to get required subsidy.`
      );

      // Check the amount of native is not higher than cap, cap specified in units of usd.
      const requiredNative = new Big(requiredNativeRaw).div(new Big(10).pow(nativeToken.decimals));
      const requiredNativeInUsd = await priceFeedService.convertCurrency(
        requiredNative.toString(),
        nativeToken.symbol as RampCurrency,
        "USD" as RampCurrency
      );

      if (new Big(requiredNativeInUsd).gt(MAX_FINAL_SETTLEMENT_SUBSIDY_USD)) {
        throw this.createUnrecoverableError(
          `FinalSettlementSubsidyExecutor: Required subsidy swap amount $${requiredNativeInUsd} exceeds maximum allowed $${MAX_FINAL_SETTLEMENT_SUBSIDY_USD}`
        );
      }

      const swapRouteResult = await getRoute({
        bypassGuardrails: true,
        enableExpress: true,
        fromAddress: fundingAccount.address,
        fromAmount: requiredNativeRaw,
        fromChain: chainId,
        fromToken: NATIVE_TOKEN_ADDRESS,
        slippageConfig: {
          autoMode: 1
        },
        toAddress: fundingAccount.address,
        toChain: chainId,
        toToken: outTokenDetails.erc20AddressSourceChain
      });

      const { route: swapRoute } = swapRouteResult.data;

      // Validate swap route output is within acceptable range (>=80% of required subsidy)
      const estimatedOutput = new Big(swapRoute.estimate.toAmount);
      const minimumAcceptableOutput = subsidyAmountRaw.mul(0.8);
      if (estimatedOutput.lt(minimumAcceptableOutput)) {
        throw this.createUnrecoverableError(
          `FinalSettlementSubsidyExecutor: SquidRouter swap output ${estimatedOutput.toString()} is below 80% of required subsidy ${subsidyAmountRaw.toString()}`
        );
      }

      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
      const nonce = await publicClient.getTransactionCount({ address: fundingAccount.address, blockTag: "pending" });
      const { hash: txHashIdx } = await this.runFinancialOperation(state, {
        attemptClass: "funding-swap",
        externalId: operation => operation.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
            data: swapRoute.transactionRequest.data as `0x${string}`,
            gas: BigInt(swapRoute.transactionRequest.gasLimit),
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            to: swapRoute.transactionRequest.target as `0x${string}`,
            value: BigInt(swapRoute.transactionRequest.value)
          });
          const receipt = await abortableCall(signal, () => publicClient.waitForTransactionReceipt({ hash }));
          if (receipt.status !== "success") throw new Error(`Swap transaction ${hash} failed`);
          return { hash };
        },
        provider: destinationNetwork,
        request: {
          amountRaw: requiredNativeRaw,
          destination: fundingAccount.address,
          network: destinationNetwork,
          nonce,
          routeTarget: swapRoute.transactionRequest.target,
          token: outTokenDetails.erc20AddressSourceChain
        },
        signal
      });

      logger.info(`FinalSettlementSubsidyExecutor: Swap transaction ${txHashIdx} confirmed. Waiting for balance update...`);

      await checkEvmBalanceForToken({
        amountDesiredRaw: subsidyAmountRaw.toString(),
        chain: destinationNetwork,
        intervalMs: BALANCE_POLLING_TIME_MS,
        ownerAddress: fundingAccount.address,
        signal,
        timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
        tokenDetails: outTokenDetails
      });
    }

    // 5. Execute the subsidy transfer (native value transfer vs ERC-20 transfer)
    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
      const nonce = await publicClient.getTransactionCount({ address: fundingAccount.address, blockTag: "pending" });
      const data = isNative
        ? undefined
        : encodeFunctionData({
            abi: erc20Abi,
            args: [ephemeralAddress, BigInt(subsidyAmountRaw.toFixed(0))],
            functionName: "transfer"
          });
      const { hash: txHash } = await this.runFinancialOperation(state, {
        attemptClass: "settlement-subsidy-transfer",
        externalId: operation => operation.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
            data,
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            to: isNative ? ephemeralAddress : (outTokenDetails.erc20AddressSourceChain as `0x${string}`),
            value: isNative ? BigInt(subsidyAmountRaw.toFixed(0)) : 0n
          });
          const receipt = await abortableCall(signal, () => publicClient.waitForTransactionReceipt({ hash }));
          if (receipt.status !== "success") throw new Error(`Subsidy transaction ${hash} failed`);
          return { hash };
        },
        provider: destinationNetwork,
        request: {
          amountRaw: subsidyAmountRaw.toFixed(0),
          destination: ephemeralAddress,
          network: destinationNetwork,
          nonce,
          source: fundingAccount.address,
          token: isNative ? NATIVE_TOKEN_ADDRESS : outTokenDetails.erc20AddressSourceChain
        },
        signal
      });

      await this.createSubsidy(
        state,
        subsidyAmountDecimal.toNumber(),
        outTokenDetails.assetSymbol as SubsidyToken,
        fundingAccount.address,
        txHash
      );

      await state.update({
        state: {
          ...state.state,
          finalSettlementSubsidyTxHash: txHash
        }
      });

      return state;
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      throw this.createRecoverableError(
        `FinalSettlementSubsidyExecutor: Error during phase execution - ${(error as Error).message}`
      );
    }
  }

  private assertMatchingDeliveryEvidence(
    evidence: SquidRouterDeliveryEvidence,
    destinationNetwork: EvmNetworks,
    destinationToken: string,
    expectedAmountRaw: string,
    baselineRaw: string,
    state: RampState
  ): void {
    const expectedSourceHash = state.state.squidRouterSwapHash ?? state.state.squidRouterPermitExecutionHash;
    const mismatch =
      evidence.destinationNetwork !== destinationNetwork ||
      evidence.destinationToken.toLowerCase() !== destinationToken.toLowerCase() ||
      evidence.expectedAmountRaw !== expectedAmountRaw ||
      (evidence.baselineRaw !== undefined && evidence.baselineRaw !== baselineRaw) ||
      (expectedSourceHash !== undefined && evidence.sourceTransactionHash !== expectedSourceHash) ||
      (evidence.kind === "destination-balance" && evidence.minimumRatioBps !== SQUID_EVM_DELIVERY_FALLBACK_MIN_RATIO_BPS);
    if (mismatch) {
      throw this.createUnrecoverableError(
        "FinalSettlementSubsidyExecutor: Persisted cross-chain delivery evidence does not match the ramp route"
      );
    }
  }
}
