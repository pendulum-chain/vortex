import {
  checkEvmBalancePeriodically,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getNetworkId,
  getOnChainTokenDetails,
  getRoute,
  isEvmToken,
  multiplyByPowerOfTen,
  Networks,
  RampCurrency,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MAX_FINAL_SETTLEMENT_SUBSIDY_USD, MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { priceFeedService } from "../../priceFeed.service";
import { BasePhaseHandler } from "../base-phase-handler";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const NATIVE_TOKENS: Record<EvmNetworks, { symbol: string; decimals: number }> = {
  [Networks.Ethereum]: { decimals: 18, symbol: "ETH" },
  [Networks.Polygon]: { decimals: 18, symbol: "MATIC" },
  [Networks.PolygonAmoy]: { decimals: 18, symbol: "MATIC" },
  [Networks.BSC]: { decimals: 18, symbol: "BNB" },
  [Networks.Arbitrum]: { decimals: 18, symbol: "ETH" },
  [Networks.Base]: { decimals: 18, symbol: "ETH" },
  [Networks.Avalanche]: { decimals: 18, symbol: "AVAX" },
  [Networks.Moonbeam]: { decimals: 18, symbol: "GLMR" }
};

/**
 * Handler for transferring funds to the destination address on EVM networks (onramp only)
 */
export class FinalSettlementSubsidyHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "finalSettlementSubsidy";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const evmClientManager = EvmClientManager.getInstance();
    const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);

    // Only handle onramp operations
    if (state.type !== RampDirection.BUY) {
      throw new Error("FinalSettlementSubsidyHandler: Only supports onramp operations");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!isEvmToken(quote.outputCurrency)) {
      throw new Error("FinalSettlementSubsidyHandler: Output currency is not an EVM token");
    }

    const outTokenDetails = getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails;
    const expectedAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals);
    const destinationNetwork = quote.network as EvmNetworks;
    const publicClient = evmClientManager.getClient(destinationNetwork);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;

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
        return this.transitionToNextPhase(state, "destinationTransfer");
      }
    }

    const actualBalance = await checkEvmBalancePeriodically(
      outTokenDetails.erc20AddressSourceChain,
      ephemeralAddress,
      "1", // If we passed expectedAmountRaw, we might timeout if the bridge slipped and delivered slightly less.
      BALANCE_POLLING_TIME_MS,
      EVM_BALANCE_CHECK_TIMEOUT_MS,
      destinationNetwork
    );

    const actualBalanceFundingAccount = await publicClient.readContract({
      abi: erc20Abi,
      address: outTokenDetails.erc20AddressSourceChain as `0x${string}`,
      args: [fundingAccount.address],
      functionName: "balanceOf"
    });

    const subsidyAmountRaw = expectedAmountRaw.minus(actualBalance);

    if (subsidyAmountRaw.lte(0)) {
      logger.info(
        `FinalSettlementSubsidyHandler: Actual balance (${actualBalance.toString()}) meets expected amount. No subsidy needed.`
      );
      return this.transitionToNextPhase(state, "destinationTransfer");
    }

    logger.info(`FinalSettlementSubsidyHandler: Subsidizing ${subsidyAmountRaw.toString()} units to ${ephemeralAddress}`);

    // Check if funding account has enough balance
    if (new Big(actualBalanceFundingAccount.toString()).lt(subsidyAmountRaw)) {
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
      console.log("values; oneUsdInNativeRaw:", oneUsdInNativeRaw);

      const chainId = getNetworkId(destinationNetwork).toString();
      const testRouteResult = await getRoute({
        bypassGuardrails: true,
        enableExpress: true,
        fromAddress: fundingAccount.address,
        fromAmount: oneUsdInNativeRaw,
        fromChain: chainId,
        fromToken: NATIVE_TOKEN_ADDRESS,
        slippageConfig: {
          autoMode: 1
        },
        toAddress: fundingAccount.address,
        toChain: chainId,
        toToken: outTokenDetails.erc20AddressSourceChain
      });

      const { route: testRoute } = testRouteResult.data;
      const rate = new Big(testRoute.estimate.toAmount).div(new Big(oneUsdInNativeRaw));
      const requiredNativeRaw = subsidyAmountRaw.div(rate).mul(1.1).toFixed(0);

      logger.info(
        `FinalSettlementSubsidyHandler: Swapping ${requiredNativeRaw} native units (approx. rate ${rate}) to get required subsidy.`
      );

      // Check the amount of native is not higher than cap, cap specidied in units of usd.
      const requiredNative = new Big(requiredNativeRaw).div(new Big(10).pow(nativeToken.decimals));
      const requiredNativeInUsd = await priceFeedService.convertCurrency(
        requiredNative.toString(),
        nativeToken.symbol as RampCurrency,
        "USD" as RampCurrency
      );

      if (new Big(requiredNativeInUsd).gt(MAX_FINAL_SETTLEMENT_SUBSIDY_USD)) {
        this.createUnrecoverableError(
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
      await checkEvmBalancePeriodically(
        outTokenDetails.erc20AddressSourceChain,
        fundingAccount.address,
        subsidyAmountRaw.toString(),
        BALANCE_POLLING_TIME_MS,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        destinationNetwork
      );
    }

    // Execution Loop
    let txHash: `0x${string}` | undefined = state.state.finalSettlementSubsidyTxHash as `0x${string}` | undefined;

    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        args: [ephemeralAddress, BigInt(subsidyAmountRaw.toFixed(0))],
        functionName: "transfer"
      });

      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

      let receipt: TransactionReceipt | undefined = undefined;
      let attempt = 0;

      while (attempt < 5 && (!receipt || receipt.status !== "success")) {
        // Blind retry for transaction submission
        txHash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
          data,
          maxFeePerGas,
          maxPriorityFeePerGas,
          to: outTokenDetails.erc20AddressSourceChain as `0x${string}`,
          value: 0n
        });

        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (!receipt || receipt.status !== "success") {
          logger.error(`FinalSettlementSubsidyHandler: Transaction ${txHash} failed or was not found. Retrying...`);
          attempt++;
          await new Promise(resolve => setTimeout(resolve, 20000));
        }
      }

      if (!receipt || receipt.status !== "success") {
        throw new Error(`Failed to confirm subsidy transaction after ${attempt} attempts`);
      }

      await state.update({
        state: {
          ...state.state,
          finalSettlementSubsidyTxHash: txHash
        }
      });

      return this.transitionToNextPhase(state, "destinationTransfer");
    } catch (error) {
      throw this.createRecoverableError(
        `FinalSettlementSubsidyHandler: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}

export default new FinalSettlementSubsidyHandler();
