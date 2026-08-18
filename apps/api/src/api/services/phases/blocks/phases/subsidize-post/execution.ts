import {
  ApiManager,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getEvmBalance,
  getEvmNativeBalance,
  getOnChainTokenDetails,
  isDeterministicPreBroadcastRevert,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampPhase,
  sleep,
  waitUntilTrueWithTimeout
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
import { calculatePostSwapSubsidyComponents } from "../../../../phases/helpers/post-swap-subsidy-breakdown";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES, getBaseL1FeeUpperBoundRaw } from "../../core/evm-destination-gas";
import { getEvmFundingAccount, runSerializedEvmFundingOperation } from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { reconcileLegacyEvmSubsidy } from "../../core/legacy-evm-subsidy";
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

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePostContext);

    if (metadata.network === Networks.Pendulum) {
      try {
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress || !metadata.outputCurrencyId) {
          throw new Error("SubsidizePostSwapExecutor: missing Pendulum state");
        }
        const manager = ApiManager.getInstance();
        const pendulum = await manager.getApi("pendulum");
        const getBalance = async (address: string) => {
          const balance = await pendulum.api.query.tokens.accounts(address, metadata.outputCurrencyId);
          return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        };
        const current = await getBalance(substrateAddress);
        if (current.eq(0)) throw this.createRecoverableError("Swap output did not arrive on Pendulum");
        const required = new Big(metadata.targetOutputAmountRaw).minus(current);
        if (required.gt(0)) {
          const funding = getFundingAccount();
          const available = await getBalance(funding.address);
          if (available.lt(required)) throw this.createUnrecoverableError("Pendulum post-swap funding balance too low");
          const result = await this.runFinancialOperation(state, {
            attemptClass: "substrate-subsidy-transfer",
            externalId: operation => operation.hash,
            perform: async () => {
              throwIfAborted(signal);
              const sent = await abortableCall(signal, () =>
                manager.executeApiCall(
                  api => api.tx.tokens.transfer(substrateAddress, metadata.outputCurrencyId, required.toFixed(0, 0)),
                  funding,
                  "pendulum"
                )
              );
              await waitUntilTrueWithTimeout(
                async () => (await getBalance(substrateAddress)).gte(metadata.targetOutputAmountRaw),
                2000,
                180000,
                signal
              );
              return { hash: sent.hash };
            },
            provider: Networks.Pendulum,
            request: {
              amountRaw: required.toFixed(0, 0),
              currencyId: metadata.outputCurrencyId,
              destination: substrateAddress,
              source: funding.address
            },
            signal
          });
          await this.createSubsidy(
            state,
            nativeToDecimal(required, metadata.outputDecimals).toNumber(),
            metadata.outputCurrency as SubsidyToken,
            funding.address,
            result.hash
          );
        }
        return state;
      } catch (e) {
        logger.error("Error in subsidizePostSwap (Pendulum):", e);
        if (e instanceof PhaseError) throw e;
        throw this.createRecoverableError("SubsidizePostSwapExecutor: Failed to subsidize post swap on Pendulum.");
      }
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

      // For BUY operations, top up to the simulated Squid bridge input; for SELL, to the
      // simulated Nabla output.
      const expectedSwapOutputAmountRaw = Big(metadata.targetOutputAmountRaw);

      const evmClientManager = EvmClientManager.getInstance();
      const destinationNetwork = outputTokenDetails.network as EvmNetworks;
      const fundingAccount = getEvmFundingAccount(destinationNetwork);

      const publicClient = evmClientManager.getClient(destinationNetwork);
      const tokenAddress = outputTokenDetails.erc20AddressSourceChain as `0x${string}`;
      let maximumTransferAmount = Big(0);
      let transferAmount = Big(0);
      let data: `0x${string}` | undefined;
      let gas: bigint | undefined;
      let maxFeePerGas: bigint | undefined;
      let maxPriorityFeePerGas: bigint | undefined;

      const operation = await runSerializedEvmFundingOperation(
        destinationNetwork,
        () =>
          this.runFinancialOperation(state, {
            adoptSafeRequestHash: true,
            attemptClass: "evm-subsidy-transfer",
            beforePerform: async () => {
              await sleep(EVM_SETTLEMENT_DELAY_MS, signal);
              const currentBalance = await checkEvmBalanceForToken({
                amountDesiredRaw: "1",
                chain: destinationNetwork,
                intervalMs: 1000,
                ownerAddress: evmEphemeralAddress,
                signal,
                timeoutMs: 5000,
                tokenDetails: outputTokenDetails
              });
              if (currentBalance.eq(0)) {
                throw new Error("Invalid phase: input token did not arrive yet on EVM");
              }

              const subsidyComponents = calculatePostSwapSubsidyComponents({
                currentBalanceRaw: currentBalance,
                discountSubsidyAmountRaw: String(metadata.subsidyAmountInOutputTokenRaw),
                expectedOutputAmountRaw: expectedSwapOutputAmountRaw,
                quotedActualOutputAmountRaw: String(metadata.actualOutputAmountRaw)
              });
              const requiredAmount = subsidyComponents.requiredAmountRaw;
              logger.debug(`SubsidizePostSwapExecutor: requiredAmount ${requiredAmount.toString()}`);
              maximumTransferAmount = requiredAmount.gt(0) ? requiredAmount : Big(0);
              if (maximumTransferAmount.gt(0)) {
                const quoteOutputUsd = await priceFeedService.convertCurrency(
                  quote.outputAmount,
                  quote.outputCurrency as RampCurrency,
                  EvmToken.USDC as RampCurrency
                );
                const discrepancyRaw = subsidyComponents.discrepancyAmountRaw;
                const discountRaw = subsidyComponents.discountAmountRaw;
                const discrepancyUsd = discrepancyRaw.gt(0)
                  ? await priceFeedService.convertCurrency(
                      nativeToDecimal(discrepancyRaw, metadata.outputDecimals).toString(),
                      outputToken as RampCurrency,
                      EvmToken.USDC as RampCurrency
                    )
                  : "0";
                const discountUsd = discountRaw.gt(0)
                  ? await priceFeedService.convertCurrency(
                      nativeToDecimal(discountRaw, metadata.outputDecimals).toString(),
                      outputToken as RampCurrency,
                      EvmToken.USDC as RampCurrency
                    )
                  : "0";
                const discrepancyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
                const discrepancyPercentageCap = Big(quoteOutputUsd).mul(discrepancyCapFraction);
                const discrepancyCapUsd = discrepancyPercentageCap.gt("1") ? discrepancyPercentageCap : Big("1");
                if (Big(discrepancyUsd).gt(discrepancyCapUsd)) {
                  throw this.createRecoverableError(
                    `SubsidizePostSwapExecutor: Required swap discrepancy subsidy $${discrepancyUsd} exceeds cap $${discrepancyCapUsd.toFixed(2)} (max of $1.00 and ${discrepancyCapFraction} of quote output $${quoteOutputUsd}).`
                  );
                }
                const discountCapFraction = config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction;
                const discountCapUsd = Big(quoteOutputUsd).mul(discountCapFraction);
                if (Big(discountUsd).gte(1) && Big(discountUsd).gt(discountCapUsd)) {
                  throw this.createRecoverableError(
                    `SubsidizePostSwapExecutor: Required discount subsidy $${discountUsd} exceeds cap $${discountCapUsd.toFixed(2)} (${discountCapFraction} of quote output $${quoteOutputUsd}).`
                  );
                }
                logger.info(
                  `Subsidizing post-swap EVM with ${maximumTransferAmount.toFixed()} to reach target value of ${expectedSwapOutputAmountRaw}`
                );
              }

              const refreshedDestinationBalance = await getEvmBalance({
                chain: destinationNetwork,
                ownerAddress: evmEphemeralAddress as `0x${string}`,
                tokenDetails: outputTokenDetails
              });
              const refreshedRequiredAmount = expectedSwapOutputAmountRaw.sub(refreshedDestinationBalance);
              if (refreshedRequiredAmount.gt(maximumTransferAmount)) {
                throw this.createRecoverableError(
                  "SubsidizePostSwapExecutor: Destination balance decreased during preflight; retrying subsidy calculation."
                );
              }
              transferAmount = refreshedRequiredAmount.gt(0) ? refreshedRequiredAmount : Big(0);
              if (transferAmount.eq(0)) return;

              data = encodeFunctionData({
                abi: erc20Abi,
                args: [evmEphemeralAddress as `0x${string}`, BigInt(transferAmount.toFixed(0))],
                functionName: "transfer"
              });
              const fundingTokenBalance = await getEvmBalance({
                chain: destinationNetwork,
                ownerAddress: fundingAccount.address,
                tokenDetails: outputTokenDetails
              });
              if (fundingTokenBalance.lt(transferAmount)) {
                logger.error("EVM_FUNDING_TOKEN_BALANCE_LOW", {
                  availableRaw: fundingTokenBalance.toFixed(),
                  network: destinationNetwork,
                  phase: this.getPhaseName(),
                  rampId: state.id,
                  requiredRaw: transferAmount.toFixed(),
                  token: tokenAddress
                });
                throw this.createRecoverableError(
                  `SubsidizePostSwapExecutor: Funding wallet token balance ${fundingTokenBalance.toFixed()} is below required subsidy ${transferAmount.toFixed()}.`
                );
              }

              const nativeBalance = await getEvmNativeBalance(fundingAccount.address, destinationNetwork);
              if (nativeBalance.lte(0)) {
                throw this.createRecoverableError("SubsidizePostSwapExecutor: Funding wallet has no native token for gas.");
              }

              const fees = await publicClient.estimateFeesPerGas();
              maxFeePerGas = fees.maxFeePerGas;
              maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
              gas = await publicClient.estimateGas({
                account: fundingAccount,
                data,
                maxFeePerGas,
                maxPriorityFeePerGas,
                to: tokenAddress,
                value: 0n
              });
              const feePerGas = fees.maxFeePerGas ?? fees.gasPrice;
              if (feePerGas === undefined) {
                throw new Error("SubsidizePostSwapExecutor: Could not estimate the funding wallet gas price");
              }
              const baseL1Fee = await getBaseL1FeeUpperBoundRaw(destinationNetwork, EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES);
              const maximumGasCost = Big(gas.toString()).mul(feePerGas.toString()).plus(baseL1Fee.toString());
              if (nativeBalance.lt(maximumGasCost)) {
                throw this.createRecoverableError(
                  `SubsidizePostSwapExecutor: Funding wallet native balance ${nativeBalance.toFixed()} is below maximum gas cost ${maximumGasCost.toFixed()}.`
                );
              }
            },
            externalId: operation => operation.hash ?? undefined,
            perform: async () => {
              if (transferAmount.eq(0)) {
                return { amountRaw: "0", hash: null };
              }
              if (data === undefined) {
                throw new Error("SubsidizePostSwapExecutor: Missing transaction data after preflight");
              }
              // Re-estimate inside the claimed operation and immediately before nonce
              // selection. The send carries this explicit gas limit, so a deterministic
              // revert here proves that nothing was broadcast.
              try {
                gas = await publicClient.estimateGas({
                  account: fundingAccount,
                  data,
                  maxFeePerGas,
                  maxPriorityFeePerGas,
                  to: tokenAddress,
                  value: 0n
                });
              } catch (error) {
                if (isDeterministicPreBroadcastRevert(error)) {
                  throw new FinancialOperationRejectedError(
                    "SubsidizePostSwapExecutor: Funding transfer was rejected during pre-broadcast gas estimation"
                  );
                }
                throw error;
              }
              const nonce = await publicClient.getTransactionCount({
                address: fundingAccount.address,
                blockTag: "pending"
              });
              const hash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
                data,
                gas,
                maxFeePerGas,
                maxPriorityFeePerGas,
                nonce,
                to: tokenAddress,
                value: 0n
              });
              const receipt = await publicClient.waitForTransactionReceipt({ hash });
              if (receipt.status !== "success") {
                throw new Error(`SubsidizePostSwapExecutor: Subsidy transaction ${hash} failed`);
              }
              return { amountRaw: transferAmount.toFixed(0), hash };
            },
            provider: destinationNetwork,
            reconcile: legacyOperation =>
              reconcileLegacyEvmSubsidy({
                destination: evmEphemeralAddress as `0x${string}`,
                getTransaction: hash => publicClient.getTransaction({ hash }),
                operation: legacyOperation,
                source: fundingAccount.address,
                targetBalanceRaw: expectedSwapOutputAmountRaw.toFixed(0),
                token: tokenAddress
              }),
            reconcileRequestMismatch: true,
            request: {
              destination: evmEphemeralAddress,
              network: destinationNetwork,
              source: fundingAccount.address,
              targetBalanceRaw: expectedSwapOutputAmountRaw.toFixed(0),
              token: tokenAddress
            },
            retryFailed: true,
            settleAfterAbort: true,
            signal
          }),
        signal
      );

      if (operation.hash) {
        const subsidyAmount = nativeToDecimal(operation.amountRaw, metadata.outputDecimals).toNumber();
        const subsidyToken = metadata.outputCurrency as unknown as SubsidyToken;
        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, operation.hash);
      }

      // The poller resolves only at or above the target and throws on timeout, so the
      // shortfall signal is the Timeout error, not a low return value.
      try {
        await checkEvmBalanceForToken({
          amountDesiredRaw: expectedSwapOutputAmountRaw.toFixed(0),
          chain: destinationNetwork,
          intervalMs: 1000,
          ownerAddress: evmEphemeralAddress,
          signal,
          timeoutMs: 5000,
          tokenDetails: outputTokenDetails
        });
      } catch (error) {
        if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
          throw this.createRecoverableError(
            "SubsidizePostSwapExecutor: Confirmed subsidy operation did not leave the destination at its target balance."
          );
        }
        throw error;
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
