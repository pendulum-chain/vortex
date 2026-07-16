import {
  ALFREDPAY_EVM_TOKEN,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  getEvmBalance,
  getNetworkId,
  getOnChainTokenDetails,
  getRoute,
  isAlfredpayToken,
  isNativeEvmToken,
  multiplyByPowerOfTen,
  NATIVE_TOKEN_ADDRESS,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampDirection,
  RampPhase,
  TokenType
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, TransactionReceipt } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import logger from "../../../../config/logger";
import { MAX_FINAL_SETTLEMENT_SUBSIDY_USD } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { priceFeedService } from "../../priceFeed.service";
import { isFiatToOwnStablecoinBaseDirect } from "../../quote/utils";
import { BasePhaseHandler } from "../base-phase-handler";
import { getEvmFundingAccount } from "../evm-funding";
import { computeSubsidyRaw } from "./final-settlement-subsidy.helpers";

const BALANCE_POLLING_TIME_MS = 5000;
// Backoff between failed subsidy-transfer attempts. Overridable so hermetic
// tests don't wait 20s per scripted failure (same pattern as
// PHASE_PROCESSOR_RETRY_DELAY_MS).
const SETTLEMENT_RETRY_BACKOFF_MS = parseInt(process.env.PHASE_SETTLEMENT_RETRY_BACKOFF_MS || "20000", 10);
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
// Wait for >=90% of expected bridge delivery to absorb slippage while still waiting for actual bridge arrival.
const MIN_BRIDGE_DELIVERY_RATIO = 0.9;

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

/**
 * Handler for transferring funds to the destination address on EVM networks (onramp only)
 */
export class FinalSettlementSubsidyHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "finalSettlementSubsidy";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.debug(`FinalSettlementSubsidyHandler: Starting phase execution for ramp ${state.id}, type=${state.type}`);

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("FinalSettlementSubsidyHandler: Quote not found for the given state");
    }

    if (
      state.state.isDirectTransfer === true &&
      !(state.type === RampDirection.SELL && isAlfredpayToken(quote.outputCurrency as FiatToken))
    ) {
      logger.info(`FinalSettlementSubsidyHandler: Skipping subsidy for direct-transfer ramp ${state.id}`);
      return state;
    }

    const evmClientManager = EvmClientManager.getInstance();
    const fundingAccount = getEvmFundingAccount(Networks.Moonbeam);

    logger.debug(
      `FinalSettlementSubsidyHandler: Quote found. inputCurrency=${quote.inputCurrency}, outputCurrency=${quote.outputCurrency}, network=${quote.network}`
    );

    if (isFiatToOwnStablecoinBaseDirect(quote.inputCurrency, quote.outputCurrency, quote.network)) {
      logger.info(`FinalSettlementSubsidyHandler: Skipping subsidy for Base direct-transfer route (ramp ${state.id})`);
      return state;
    }

    const isAlfredpaySell = state.type === RampDirection.SELL && isAlfredpayToken(quote.outputCurrency as FiatToken);

    const outTokenDetails =
      state.type === RampDirection.BUY
        ? (getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails)
        : isAlfredpaySell
          ? getOnChainTokenDetails(Networks.Polygon, ALFREDPAY_EVM_TOKEN)
          : getOnChainTokenDetails(Networks.Polygon, EvmToken.USDC);

    if (!outTokenDetails || outTokenDetails.type === TokenType.AssetHub) {
      // Should not happen. Destination onchain token or USDC must be defined.
      throw new Error("FinalSettlementSubsidyHandler: Output currency is not an EVM token");
    }

    const isNative = isNativeEvmToken(outTokenDetails);

    let expectedAmountRaw: Big | undefined;
    switch (state.type) {
      case RampDirection.BUY:
        expectedAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals);
        break;
      case RampDirection.SELL:
        if (isAlfredpayToken(quote.outputCurrency as FiatToken)) {
          if (!quote.metadata.alfredpayOfframp) {
            throw new Error("FinalSettlementSubsidyHandler: Missing Alfredpay offramp metadata");
          }
          expectedAmountRaw = Big(quote.metadata.alfredpayOfframp.inputAmountRaw);
          break;
        }
        break;
    }

    if (!expectedAmountRaw) {
      throw new Error("FinalSettlementSubsidyHandler: Unable to determine expected amount for subsidy");
    }

    const destinationNetwork = state.type === RampDirection.BUY ? (quote.network as EvmNetworks) : Networks.Polygon;
    const publicClient = evmClientManager.getClient(destinationNetwork);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;

    logger.debug(
      `FinalSettlementSubsidyHandler: expectedAmountRaw=${expectedAmountRaw.toString()}, destinationNetwork=${destinationNetwork}, ephemeralAddress=${ephemeralAddress}, isNative=${isNative}`
    );

    // 1. Idempotency Check
    if (state.state.finalSettlementSubsidyTxHash) {
      const receipt = await publicClient
        .getTransactionReceipt({
          hash: state.state.finalSettlementSubsidyTxHash as `0x${string}`
        })
        .catch(() => null);

      if (receipt && receipt.status === "success") {
        logger.info(
          `FinalSettlementSubsidyHandler: Transaction ${state.state.finalSettlementSubsidyTxHash} already successful. Skipping.`
        );
        return state;
      }
    }

    // 2. Check ephemeral address balance (handles both native and ERC-20 automatically)
    logger.debug(
      `FinalSettlementSubsidyHandler: Polling ephemeral balance for ${ephemeralAddress} on ${destinationNetwork} (timeout=${EVM_BALANCE_CHECK_TIMEOUT_MS}ms, interval=${BALANCE_POLLING_TIME_MS}ms)`
    );
    const actualBalance = await checkEvmBalanceForToken({
      amountDesiredRaw: expectedAmountRaw.mul(MIN_BRIDGE_DELIVERY_RATIO).toFixed(0, 0),
      chain: destinationNetwork,
      intervalMs: BALANCE_POLLING_TIME_MS,
      ownerAddress: ephemeralAddress,
      timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
      tokenDetails: outTokenDetails
    });
    logger.debug(`FinalSettlementSubsidyHandler: Ephemeral balance=${actualBalance.toString()}`);

    const preBalance = new Big(state.state.preSettlementBalance ?? "0");
    const deliveredRaw = actualBalance.minus(preBalance);
    const delivered = deliveredRaw.gte(0) ? deliveredRaw : new Big(0);

    // 3. Check funding account balance (handles both native and ERC-20 automatically)
    logger.debug(`FinalSettlementSubsidyHandler: Checking funding account balance at ${fundingAccount.address}`);
    const actualBalanceFundingAccount = await getEvmBalance({
      chain: destinationNetwork,
      ownerAddress: fundingAccount.address as `0x${string}`,
      tokenDetails: outTokenDetails
    });
    logger.debug(`FinalSettlementSubsidyHandler: Funding account balance=${actualBalanceFundingAccount.toString()}`);

    // Clamped to the true on-chain shortfall — see computeSubsidyRaw. This bounds any over-subsidy
    // from a mis-timed preSettlementBalance snapshot (e.g. same-chain synchronous swaps).
    const deliveredBasedSubsidy = expectedAmountRaw.minus(delivered);
    const subsidyAmountRaw = computeSubsidyRaw(expectedAmountRaw, delivered, actualBalance);
    logger.debug(
      `FinalSettlementSubsidyHandler: subsidyAmountRaw=${subsidyAmountRaw.toString()} (expected=${expectedAmountRaw.toString()} - delivered=${delivered.toString()}, actualBalance=${actualBalance.toString()}, preSettlementBalance=${preBalance.toString()})`
    );

    if (subsidyAmountRaw.lt(deliveredBasedSubsidy)) {
      logger.warn(
        `FinalSettlementSubsidyHandler: Clamped subsidy ${deliveredBasedSubsidy.toString()} -> ${subsidyAmountRaw.toString()} ` +
          `(actualBalance=${actualBalance.toString()}, expected=${expectedAmountRaw.toString()}, delivered=${delivered.toString()}). ` +
          "delivered-calc disagrees with chain balance."
      );
    }

    if (subsidyAmountRaw.lte(0)) {
      logger.info(
        `FinalSettlementSubsidyHandler: Delivered amount (${delivered.toString()}) meets expected amount with actualBalance=${actualBalance.toString()} and preSettlementBalance=${preBalance.toString()}. No subsidy needed.`
      );
      return state;
    }

    logger.info(
      `FinalSettlementSubsidyHandler: Subsidizing ${subsidyAmountRaw.toString()} raw units of ${isNative ? "native token" : outTokenDetails.assetSymbol} to ${ephemeralAddress}`
    );

    // 4. Top up funding account if insufficient balance (ERC-20 only; native tokens are transferred directly)
    if (!isNative && actualBalanceFundingAccount.lt(subsidyAmountRaw)) {
      logger.info(
        `FinalSettlementSubsidyHandler: Funding account has insufficient balance. Swapping native token to ${outTokenDetails.assetSymbol}`
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
        `FinalSettlementSubsidyHandler: Swapping ${requiredNativeRaw} native units (approx. rate ${rate}) to get required subsidy.`
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
          `FinalSettlementSubsidyHandler: Required subsidy swap amount $${requiredNativeInUsd} exceeds maximum allowed $${MAX_FINAL_SETTLEMENT_SUBSIDY_USD}`
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

      // F-030: Validate swap route output is within acceptable range (≥80% of required subsidy)
      const estimatedOutput = new Big(swapRoute.estimate.toAmount);
      const minimumAcceptableOutput = subsidyAmountRaw.mul(0.8);
      if (estimatedOutput.lt(minimumAcceptableOutput)) {
        throw this.createUnrecoverableError(
          `FinalSettlementSubsidyHandler: SquidRouter swap output ${estimatedOutput.toString()} is below 80% of required subsidy ${subsidyAmountRaw.toString()}`
        );
      }

      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
      const txHashIdx = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
        data: swapRoute.transactionRequest.data as `0x${string}`,
        gas: BigInt(swapRoute.transactionRequest.gasLimit),
        maxFeePerGas,
        maxPriorityFeePerGas,
        to: swapRoute.transactionRequest.target as `0x${string}`,
        value: BigInt(swapRoute.transactionRequest.value)
      });

      logger.info(`FinalSettlementSubsidyHandler: Swap transaction sent: ${txHashIdx}. Waiting for receipt...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHashIdx });

      if (receipt.status !== "success") {
        throw new Error(`Swap transaction ${txHashIdx} failed`);
      }

      logger.info("FinalSettlementSubsidyHandler: Swap successful. Waiting for balance update...");

      // Wait for balance checks to pass
      await checkEvmBalanceForToken({
        amountDesiredRaw: subsidyAmountRaw.toString(),
        chain: destinationNetwork,
        intervalMs: BALANCE_POLLING_TIME_MS,
        ownerAddress: fundingAccount.address,
        timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
        tokenDetails: outTokenDetails
      });
    }

    // 5. Execute the subsidy transfer (native value transfer vs ERC-20 transfer)
    let txHash: `0x${string}` | undefined = state.state.finalSettlementSubsidyTxHash as `0x${string}` | undefined;

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

      let receipt: TransactionReceipt | undefined = undefined;
      let attempt = 0;

      while (attempt < 5 && (!receipt || receipt.status !== "success")) {
        logger.debug(`FinalSettlementSubsidyHandler: Subsidy transfer attempt ${attempt + 1}/5, isNative=${isNative}`);
        if (isNative) {
          // Native token: simple value transfer, no contract interaction
          txHash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
            maxFeePerGas,
            maxPriorityFeePerGas,
            to: ephemeralAddress,
            value: BigInt(subsidyAmountRaw.toFixed(0))
          });
        } else {
          // ERC-20: encode transfer call
          const data = encodeFunctionData({
            abi: erc20Abi,
            args: [ephemeralAddress, BigInt(subsidyAmountRaw.toFixed(0))],
            functionName: "transfer"
          });

          txHash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
            data,
            maxFeePerGas,
            maxPriorityFeePerGas,
            to: outTokenDetails.erc20AddressSourceChain as `0x${string}`,
            value: 0n
          });
        }

        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (!receipt || receipt.status !== "success") {
          logger.error(`FinalSettlementSubsidyHandler: Transaction ${txHash} failed or was not found. Retrying...`);
          attempt++;
          await new Promise(resolve => setTimeout(resolve, SETTLEMENT_RETRY_BACKOFF_MS));
        }
      }

      if (!receipt || receipt.status !== "success") {
        throw new Error(`Failed to confirm subsidy transaction after ${attempt} attempts`);
      }

      if (txHash) {
        const subsidyToken = isNative ? NATIVE_TOKENS[destinationNetwork].symbol : outTokenDetails.assetSymbol;
        const subsidyAmount = nativeToDecimal(
          subsidyAmountRaw,
          isNative ? NATIVE_TOKENS[destinationNetwork].decimals : outTokenDetails.decimals
        ).toNumber();
        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);
      }

      await state.update({
        state: {
          ...state.state,
          finalSettlementSubsidyTxHash: txHash
        }
      });

      return state;
    } catch (error) {
      throw this.createRecoverableError(
        `FinalSettlementSubsidyHandler: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}

export default new FinalSettlementSubsidyHandler();
