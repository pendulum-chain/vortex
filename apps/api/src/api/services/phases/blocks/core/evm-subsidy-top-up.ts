import {
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getEvmBalance,
  getEvmNativeBalance,
  isDeterministicPreBroadcastRevert,
  nativeToDecimal,
  sleep
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../config/logger";
import RampState from "../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../models/subsidy.model";
import { BasePhaseHandler } from "../../base-phase-handler";
import { EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES, getBaseL1FeeUpperBoundRaw } from "./evm-destination-gas";
import { getEvmFundingAccount, runSerializedEvmFundingOperation } from "./evm-funding";
import { FinancialOperationRejectedError } from "./financial-operation";
import { reconcileLegacyEvmSubsidy } from "./legacy-evm-subsidy";

const EVM_SETTLEMENT_DELAY_MS = parseInt(process.env.SUBSIDY_SETTLEMENT_DELAY_MS || "15000", 10);

interface EvmSubsidyTopUp {
  /**
   * Called once the ephemeral's current balance is known. Returns the raw shortfall to the target and
   * the executor-specific cap check, which runs only when a positive transfer is needed.
   */
  assess(currentBalance: Big): { enforceCaps(maximumTransferAmount: Big): Promise<void>; requiredAmountRaw: Big };
  decimals: number;
  ephemeralAddress: string;
  /** Class name used as the prefix of every error message, e.g. "SubsidizePreSwapExecutor". */
  executorName: string;
  /** "pre-swap" or "post-swap"; only appears in the info log. */
  label: string;
  signal?: AbortSignal;
  state: RampState;
  subsidyToken: SubsidyToken;
  /** Raw token balance the ephemeral must hold afterwards. */
  targetRaw: Big;
  tokenDetails: EvmTokenDetails;
}

/**
 * Shared EVM path of the pre- and post-swap subsidy phases: tops the ephemeral's token balance up to
 * the target from the treasury funding wallet in one reconciled financial operation.
 */
export abstract class EvmSubsidyTopUpExecutor extends BasePhaseHandler {
  protected async topUpEvmEphemeral({
    assess,
    decimals,
    ephemeralAddress,
    executorName,
    label,
    signal,
    state,
    subsidyToken,
    targetRaw,
    tokenDetails
  }: EvmSubsidyTopUp): Promise<void> {
    const targetBalanceRaw = targetRaw.toFixed(0);
    const evmClientManager = EvmClientManager.getInstance();
    const destinationNetwork = tokenDetails.network as EvmNetworks;
    const fundingAccount = getEvmFundingAccount(destinationNetwork);

    const publicClient = evmClientManager.getClient(destinationNetwork);
    const tokenAddress = tokenDetails.erc20AddressSourceChain as `0x${string}`;
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
              ownerAddress: ephemeralAddress,
              signal,
              timeoutMs: 5000,
              tokenDetails
            });
            if (currentBalance.eq(0)) {
              throw new Error("Invalid phase: input token did not arrive yet on EVM");
            }

            const { enforceCaps, requiredAmountRaw } = assess(currentBalance);
            logger.debug(`${executorName}: requiredAmount ${requiredAmountRaw.toString()}`);
            maximumTransferAmount = requiredAmountRaw.gt(0) ? requiredAmountRaw : Big(0);
            if (maximumTransferAmount.gt(0)) {
              await enforceCaps(maximumTransferAmount);
              logger.info(
                `Subsidizing ${label} EVM with ${maximumTransferAmount.toFixed()} to reach target value of ${targetBalanceRaw}`
              );
            }

            const refreshedDestinationBalance = await getEvmBalance({
              chain: destinationNetwork,
              ownerAddress: ephemeralAddress as `0x${string}`,
              tokenDetails
            });
            const refreshedRequiredAmount = targetRaw.sub(refreshedDestinationBalance);
            if (refreshedRequiredAmount.gt(maximumTransferAmount)) {
              throw this.createRecoverableError(
                `${executorName}: Destination balance decreased during preflight; retrying subsidy calculation.`
              );
            }
            transferAmount = refreshedRequiredAmount.gt(0) ? refreshedRequiredAmount : Big(0);
            if (transferAmount.eq(0)) return;

            data = encodeFunctionData({
              abi: erc20Abi,
              args: [ephemeralAddress as `0x${string}`, BigInt(transferAmount.toFixed(0))],
              functionName: "transfer"
            });
            const fundingTokenBalance = await getEvmBalance({
              chain: destinationNetwork,
              ownerAddress: fundingAccount.address,
              tokenDetails
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
                `${executorName}: Funding wallet token balance ${fundingTokenBalance.toFixed()} is below required subsidy ${transferAmount.toFixed()}.`
              );
            }

            const nativeBalance = await getEvmNativeBalance(fundingAccount.address, destinationNetwork);
            if (nativeBalance.lte(0)) {
              throw this.createRecoverableError(`${executorName}: Funding wallet has no native token for gas.`);
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
              throw new Error(`${executorName}: Could not estimate the funding wallet gas price`);
            }
            const baseL1Fee = await getBaseL1FeeUpperBoundRaw(destinationNetwork, EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES);
            const maximumGasCost = Big(gas.toString()).mul(feePerGas.toString()).plus(baseL1Fee.toString());
            if (nativeBalance.lt(maximumGasCost)) {
              throw this.createRecoverableError(
                `${executorName}: Funding wallet native balance ${nativeBalance.toFixed()} is below maximum gas cost ${maximumGasCost.toFixed()}.`
              );
            }
          },
          externalId: operation => operation.hash ?? undefined,
          perform: async () => {
            if (transferAmount.eq(0)) {
              return { amountRaw: "0", hash: null };
            }
            if (data === undefined) {
              throw new Error(`${executorName}: Missing transaction data after preflight`);
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
                  `${executorName}: Funding transfer was rejected during pre-broadcast gas estimation`
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
              throw new Error(`${executorName}: Subsidy transaction ${hash} failed`);
            }
            return { amountRaw: transferAmount.toFixed(0), hash };
          },
          provider: destinationNetwork,
          reconcile: legacyOperation =>
            reconcileLegacyEvmSubsidy({
              destination: ephemeralAddress as `0x${string}`,
              getTransaction: hash => publicClient.getTransaction({ hash }),
              operation: legacyOperation,
              source: fundingAccount.address,
              targetBalanceRaw,
              token: tokenAddress
            }),
          reconcileRequestMismatch: true,
          request: {
            destination: ephemeralAddress,
            network: destinationNetwork,
            source: fundingAccount.address,
            targetBalanceRaw,
            token: tokenAddress
          },
          retryFailed: true,
          settleAfterAbort: true,
          signal
        }),
      signal
    );

    if (operation.hash) {
      const subsidyAmount = nativeToDecimal(operation.amountRaw, decimals).toNumber();
      await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, operation.hash);
    }

    // The poller resolves only at or above the target and throws on timeout, so the
    // shortfall signal is the Timeout error, not a low return value.
    try {
      await checkEvmBalanceForToken({
        amountDesiredRaw: targetBalanceRaw,
        chain: destinationNetwork,
        intervalMs: 1000,
        ownerAddress: ephemeralAddress,
        signal,
        timeoutMs: 5000,
        tokenDetails
      });
    } catch (error) {
      if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
        throw this.createRecoverableError(
          `${executorName}: Confirmed subsidy operation did not leave the destination at its target balance.`
        );
      }
      throw error;
    }
  }
}
