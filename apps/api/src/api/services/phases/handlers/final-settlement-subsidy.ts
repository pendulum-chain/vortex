import {
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
  RampCurrency,
  RampDirection,
  RampPhase,
  TokenType
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, TransactionReceipt } from "viem";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import logger from "../../../../config/logger";
import { MAX_FINAL_SETTLEMENT_SUBSIDY_USD, MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { priceFeedService } from "../../priceFeed.service";
import { BasePhaseHandler } from "../base-phase-handler";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

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

  private getNextPhase(state: RampState, quote: QuoteTicket): RampPhase {
    return state.type === RampDirection.SELL && isAlfredpayToken(quote.outputCurrency as FiatToken)
      ? "alfredpayOfframpTransfer"
      : "destinationTransfer";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const evmClientManager = EvmClientManager.getInstance();
    const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("FinalSettlementSubsidyHandler: Quote not found for the given state");
    }

    const outTokenDetails =
      state.type === RampDirection.BUY
        ? (getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails)
        : getOnChainTokenDetails(Networks.Polygon, EvmToken.USDC);

    if (!outTokenDetails || outTokenDetails.type === TokenType.AssetHub) {
      // Should not happen. Destination onchain token or USDC must be defined.
      throw new Error("FinalSettlementSubsidyHandler: Output currency is not an EVM token");
    }

    const isNative = isNativeEvmToken(outTokenDetails);

    let expectedAmountRaw: Big | undefined;
    switch (state.type) {
      case RampDirection.BUY:
        if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
          if (!quote.metadata.alfredpayMint) {
            throw new Error("FinalSettlementSubsidyHandler: Missing Alfredpay mint metadata");
          }
          expectedAmountRaw = Big(quote.metadata.alfredpayMint.outputAmountRaw);
          break;
        }
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
        return this.transitionToNextPhase(state, this.getNextPhase(state, quote));
      }
    }

    // 2. Check ephemeral address balance (handles both native and ERC-20 automatically)
    const actualBalance = await checkEvmBalanceForToken({
      amountDesiredRaw: "1", // If we passed expectedAmountRaw, we might timeout if the bridge slipped and delivered slightly less.
      chain: destinationNetwork,
      intervalMs: BALANCE_POLLING_TIME_MS,
      ownerAddress: ephemeralAddress,
      timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
      tokenDetails: outTokenDetails
    });

    // 3. Check funding account balance (handles both native and ERC-20 automatically)
    const actualBalanceFundingAccount = await getEvmBalance({
      chain: destinationNetwork,
      ownerAddress: fundingAccount.address as `0x${string}`,
      tokenDetails: outTokenDetails
    });

    const subsidyAmountRaw = expectedAmountRaw.minus(actualBalance);

    if (subsidyAmountRaw.lte(0)) {
      logger.info(
        `FinalSettlementSubsidyHandler: Actual balance (${actualBalance.toString()}) meets expected amount. No subsidy needed.`
      );
      return this.transitionToNextPhase(state, this.getNextPhase(state, quote));
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
      const testRouteResult = await getRoute({
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
      });

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

      return this.transitionToNextPhase(state, this.getNextPhase(state, quote));
    } catch (error) {
      throw this.createRecoverableError(
        `FinalSettlementSubsidyHandler: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}

export default new FinalSettlementSubsidyHandler();
