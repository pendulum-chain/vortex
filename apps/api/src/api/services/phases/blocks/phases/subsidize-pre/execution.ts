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
  getPendulumDetails,
  isDeterministicPreBroadcastRevert,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampDirection,
  RampPhase,
  sleep,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import { Big } from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { getFundingAccount } from "../../../../../controllers/subsidize.controller";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES, getBaseL1FeeUpperBoundRaw } from "../../core/evm-destination-gas";
import { getEvmFundingAccount, runSerializedEvmFundingOperation } from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { reconcileLegacyEvmSubsidy } from "../../core/legacy-evm-subsidy";
import { getBlockMetadata } from "../../core/metadata";
import { SubsidizePreContext } from "./simulation";

const EVM_SETTLEMENT_DELAY_MS = parseInt(process.env.SUBSIDY_SETTLEMENT_DELAY_MS || "15000", 10);

export class SubsidizePreSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
  }

  public getMaxRetries(): number {
    return 200;
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePreContext);

    if (metadata.network === Networks.Pendulum) {
      try {
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress) throw new Error("SubsidizePreSwapExecutor: missing Substrate ephemeral");
        const manager = ApiManager.getInstance();
        const pendulum = await manager.getApi("pendulum");
        const currencyId = metadata.inputCurrencyId ?? getPendulumDetails(metadata.inputCurrency as RampCurrency).currencyId;
        const getBalance = async (address: string) => {
          const balance = await pendulum.api.query.tokens.accounts(address, currencyId);
          return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        };
        const current = await getBalance(substrateAddress);
        if (current.eq(0)) throw this.createRecoverableError("Input token did not arrive on Pendulum");
        const required = new Big(metadata.targetInputAmountRaw).minus(current);
        if (required.gt(0)) {
          const funding = getFundingAccount();
          const available = await getBalance(funding.address);
          if (available.lt(required)) throw this.createUnrecoverableError("Pendulum pre-swap funding balance too low");
          const result = await this.runFinancialOperation(state, {
            attemptClass: "substrate-subsidy-transfer",
            externalId: operation => operation.hash,
            perform: async () => {
              throwIfAborted(signal);
              const sent = await abortableCall(signal, () =>
                manager.executeApiCall(
                  api => api.tx.tokens.transfer(substrateAddress, currencyId, required.toFixed(0, 0)),
                  funding,
                  "pendulum"
                )
              );
              await waitUntilTrueWithTimeout(
                async () => (await getBalance(substrateAddress)).gte(metadata.targetInputAmountRaw),
                5000,
                180000,
                signal
              );
              return { hash: sent.hash };
            },
            provider: Networks.Pendulum,
            request: {
              amountRaw: required.toFixed(0, 0),
              currencyId,
              destination: substrateAddress,
              source: funding.address
            },
            signal
          });
          await this.createSubsidy(
            state,
            nativeToDecimal(required, metadata.inputDecimals).toNumber(),
            metadata.inputCurrency as SubsidyToken,
            funding.address,
            result.hash
          );
        }
        return state;
      } catch (e) {
        logger.error("Error in subsidizePreSwap (Pendulum):", e);
        if (e instanceof PhaseError) throw e;
        throw this.createRecoverableError("SubsidizePreSwapExecutor: Failed to subsidize pre swap on Pendulum.");
      }
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePreSwapExecutor: State metadata corrupted. This is a bug.");
    }

    try {
      const inputToken = metadata.inputCurrency as EvmToken;
      const inputNetwork = metadata.network as Networks;
      const inputTokenDetails = getOnChainTokenDetails(inputNetwork, inputToken) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error(
          `Could not find token details for input token ${inputToken} on network ${inputNetwork}. Invalid quote metadata.`
        );
      }
      // The swap consumes targetInputAmountRaw; feeReserveRaw (Alfredpay corridors)
      // additionally keeps the later distributeFees transfers funded on the ephemeral.
      const expectedInputAmountForSwapRaw = Big(metadata.targetInputAmountRaw)
        .plus(metadata.feeReserveRaw ?? "0")
        .toFixed(0);

      const evmClientManager = EvmClientManager.getInstance();
      const destinationNetwork = inputTokenDetails.network as EvmNetworks;
      const fundingAccount = getEvmFundingAccount(destinationNetwork);

      const publicClient = evmClientManager.getClient(destinationNetwork);
      const tokenAddress = inputTokenDetails.erc20AddressSourceChain as `0x${string}`;
      let maximumTransferAmount = Big(0);
      let transferAmount = Big(0);
      let data: `0x${string}` | undefined;
      let gas: bigint | undefined;
      let maxFeePerGas: bigint | undefined;
      let maxPriorityFeePerGas: bigint | undefined;

      const operation = await this.runFinancialOperation(state, {
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
            tokenDetails: inputTokenDetails
          });
          if (currentBalance.eq(0)) {
            throw new Error("Invalid phase: input token did not arrive yet on EVM");
          }

          const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
          logger.debug(`SubsidizePreSwapExecutor: requiredAmount ${requiredAmount.toString()}`);
          maximumTransferAmount = requiredAmount.gt(0) ? requiredAmount : Big(0);
          if (maximumTransferAmount.gt(0)) {
            const subsidyDecimal = nativeToDecimal(maximumTransferAmount, metadata.inputDecimals).toString();
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
              throw this.createRecoverableError(
                `SubsidizePreSwapExecutor: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (max of $1.00 and ${subsidyCapFraction} of quote output $${quoteOutputUsd}).`
              );
            }
            logger.info(
              `Subsidizing pre-swap EVM with ${maximumTransferAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
            );
          }

          const refreshedDestinationBalance = await getEvmBalance({
            chain: destinationNetwork,
            ownerAddress: evmEphemeralAddress as `0x${string}`,
            tokenDetails: inputTokenDetails
          });
          const refreshedRequiredAmount = Big(expectedInputAmountForSwapRaw).sub(refreshedDestinationBalance);
          if (refreshedRequiredAmount.gt(maximumTransferAmount)) {
            throw this.createRecoverableError(
              "SubsidizePreSwapExecutor: Destination balance decreased during preflight; retrying subsidy calculation."
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
            tokenDetails: inputTokenDetails
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
              `SubsidizePreSwapExecutor: Funding wallet token balance ${fundingTokenBalance.toFixed()} is below required subsidy ${transferAmount.toFixed()}.`
            );
          }

          const nativeBalance = await getEvmNativeBalance(fundingAccount.address, destinationNetwork);
          if (nativeBalance.lte(0)) {
            throw this.createRecoverableError("SubsidizePreSwapExecutor: Funding wallet has no native token for gas.");
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
            throw new Error("SubsidizePreSwapExecutor: Could not estimate the funding wallet gas price");
          }
          const baseL1Fee = await getBaseL1FeeUpperBoundRaw(destinationNetwork, EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES);
          const maximumGasCost = Big(gas.toString()).mul(feePerGas.toString()).plus(baseL1Fee.toString());
          if (nativeBalance.lt(maximumGasCost)) {
            throw this.createRecoverableError(
              `SubsidizePreSwapExecutor: Funding wallet native balance ${nativeBalance.toFixed()} is below maximum gas cost ${maximumGasCost.toFixed()}.`
            );
          }
        },
        externalId: operation => operation.hash ?? undefined,
        perform: async () => {
          throwIfAborted(signal);
          if (transferAmount.eq(0)) {
            return { amountRaw: "0", hash: null };
          }
          if (data === undefined) {
            throw new Error("SubsidizePreSwapExecutor: Missing transaction data after preflight");
          }
          const hash = await runSerializedEvmFundingOperation(destinationNetwork, async () => {
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
                  "SubsidizePreSwapExecutor: Funding transfer was rejected during pre-broadcast gas estimation"
                );
              }
              throw error;
            }
            const nonce = await publicClient.getTransactionCount({
              address: fundingAccount.address,
              blockTag: "pending"
            });
            const transactionHash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
              data,
              gas,
              maxFeePerGas,
              maxPriorityFeePerGas,
              nonce,
              to: tokenAddress,
              value: 0n
            });
            const receipt = await abortableCall(signal, () =>
              publicClient.waitForTransactionReceipt({ hash: transactionHash })
            );
            if (receipt.status !== "success") {
              throw new Error(`SubsidizePreSwapExecutor: Subsidy transaction ${transactionHash} failed`);
            }
            return transactionHash;
          });
          return { amountRaw: transferAmount.toFixed(0), hash };
        },
        provider: destinationNetwork,
        reconcile: legacyOperation =>
          reconcileLegacyEvmSubsidy({
            destination: evmEphemeralAddress as `0x${string}`,
            getTransaction: hash => publicClient.getTransaction({ hash }),
            operation: legacyOperation,
            source: fundingAccount.address,
            targetBalanceRaw: expectedInputAmountForSwapRaw,
            token: tokenAddress
          }),
        reconcileRequestMismatch: true,
        request: {
          destination: evmEphemeralAddress,
          network: destinationNetwork,
          source: fundingAccount.address,
          targetBalanceRaw: expectedInputAmountForSwapRaw,
          token: tokenAddress
        },
        retryFailed: true,
        signal
      });

      if (operation.hash) {
        const subsidyAmount = nativeToDecimal(operation.amountRaw, metadata.inputDecimals).toNumber();
        const subsidyToken = metadata.inputCurrency as unknown as SubsidyToken;
        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, operation.hash);
      }

      // The poller resolves only at or above the target and throws on timeout, so the
      // shortfall signal is the Timeout error, not a low return value.
      try {
        await checkEvmBalanceForToken({
          amountDesiredRaw: expectedInputAmountForSwapRaw,
          chain: destinationNetwork,
          intervalMs: 1000,
          ownerAddress: evmEphemeralAddress,
          signal,
          timeoutMs: 5000,
          tokenDetails: inputTokenDetails
        });
      } catch (error) {
        if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
          throw this.createRecoverableError(
            "SubsidizePreSwapExecutor: Confirmed subsidy operation did not leave the destination at its target balance."
          );
        }
        throw error;
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
