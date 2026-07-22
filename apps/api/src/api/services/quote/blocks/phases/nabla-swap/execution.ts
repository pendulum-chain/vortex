import { createExecuteMessageExtrinsic, readMessage, submitExtrinsic } from "@pendulum-chain/api-solang";
import { Abi } from "@polkadot/api-contract";
import {
  ApiManager,
  checkEvmBalanceForToken,
  decodeSubmittableExtrinsic,
  defaultReadLimits,
  EvmClientManager,
  EvmToken,
  EvmTokenDetails,
  evmTokenConfig,
  getOnChainTokenDetails,
  NABLA_ROUTER,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import { Big } from "big.js";
import { parseTransaction, recoverTransactionAddress } from "viem";
import logger from "../../../../../../config/logger";
import { erc20WrapperAbi } from "../../../../../../contracts/ERC20Wrapper";
import { routerAbi } from "../../../../../../contracts/Router";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import { NablaSwapContext } from "./simulation";

// EVM slice of the production NablaApprovePhaseHandler: broadcasts the presigned ERC-20 approve
// for the Nabla router on Base. The substrate (Pendulum) branch is not ported.
export class NablaApproveExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "nablaApprove";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) throw new Error("Quote not found for the given state");
    const metadata = getBlockMetadata(quote.metadata, NablaSwapContext);
    if (metadata.network === Networks.Pendulum) {
      const manager = ApiManager.getInstance();
      const pendulum = await manager.getApi("pendulum");
      const substrateAddress = state.state.substrateEphemeralAddress;
      if (!substrateAddress || !metadata.inputCurrencyId) throw new Error("NablaApproveExecutor: missing Pendulum data");
      const approval = await pendulum.api.query.tokenAllowance.approvals(
        metadata.inputCurrencyId,
        substrateAddress,
        NABLA_ROUTER
      );
      if (new Big(approval.toString() || "0").gte(metadata.inputAmountForSwapRaw)) return state;
      const preparation = getBlockState<{
        approveExtrinsicOptions: Parameters<typeof createExecuteMessageExtrinsic>[0];
      }>(state.state, NablaSwapContext);
      const abi = new Abi(erc20WrapperAbi, pendulum.api.registry.getChainProperties());
      const dryRun = await createExecuteMessageExtrinsic({
        ...preparation.approveExtrinsicOptions,
        abi,
        api: pendulum.api,
        skipDryRunning: false
      });
      if (!dryRun.result || dryRun.result.type !== "success") throw new Error("Could not dry-run Nabla approval");
      const presigned = this.getPresignedTransaction(state, "nablaApprove");
      const result = await submitExtrinsic(decodeSubmittableExtrinsic(presigned.txData as string, pendulum.api));
      if (result.status.type === "error") throw new Error("Could not approve token");
      return state;
    }
    const evmClientManager = EvmClientManager.getInstance();
    const baseClient = evmClientManager.getClient(Networks.Base);

    try {
      const { txData: nablaApproveTransaction } = this.getPresignedTransaction(state, "nablaApprove");

      if (typeof nablaApproveTransaction !== "string") {
        throw new Error("NablaApproveExecutor: Invalid EVM transaction data. This is a bug.");
      }

      const txHash = await baseClient.sendRawTransaction({
        serializedTransaction: nablaApproveTransaction as `0x${string}`
      });

      const receipt = await baseClient.waitForTransactionReceipt({
        hash: txHash
      });

      if (!receipt || receipt.status !== "success") {
        throw new Error(`NablaApproveExecutor: EVM approve transaction ${txHash} failed`);
      }

      logger.info(`NablaApproveExecutor: EVM approve transaction successful: ${txHash}`);

      return state;
    } catch (e) {
      logger.error(`Could not approve token on EVM: ${(e as Error).message}`);
      throw e;
    }
  }
}

// EVM slice of the production NablaSwapPhaseHandler: validates the ephemeral holds the simulated
// swap input on Base, then broadcasts the presigned swap. The substrate branch (soft-minimum
// dry-run via getAmountOut) is not ported.
export class NablaSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "nablaSwap";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, NablaSwapContext);

    if (metadata.network === Networks.Pendulum) {
      return this.executePendulumSwap(state, metadata);
    }

    const evmEphemeralAddress = state.state.evmEphemeralAddress;
    if (!evmEphemeralAddress) {
      throw new Error("Missing EVM ephemeral address to validate nabla swap input balance");
    }

    const inputTokenDetails = evmTokenConfig[Networks.Base]?.[metadata.inputCurrency as EvmToken] as
      | EvmTokenDetails
      | undefined;
    if (!inputTokenDetails) {
      throw new Error(`Invalid input token ${metadata.inputCurrency} for Base nabla swap`);
    }

    try {
      await checkEvmBalanceForToken({
        amountDesiredRaw: metadata.inputAmountForSwapRaw,
        chain: Networks.Base,
        intervalMs: 1000,
        ownerAddress: evmEphemeralAddress,
        timeoutMs: 5000,
        tokenDetails: inputTokenDetails
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(`Could not validate EVM input balance before swap: ${errorMessage}`);

      throw this.createUnrecoverableError(`Could not validate EVM input balance before swap: ${errorMessage}`);
    }

    const evmClientManager = EvmClientManager.getInstance();
    const baseClient = evmClientManager.getClient(Networks.Base);

    try {
      const { txData: nablaSwapTransaction } = this.getPresignedTransaction(state, "nablaSwap");

      if (typeof nablaSwapTransaction !== "string") {
        throw new Error("NablaSwapExecutor: Invalid EVM transaction data. This is a bug.");
      }

      await this.dryRunEvmSwap(nablaSwapTransaction as `0x${string}`, evmEphemeralAddress as `0x${string}`);

      const txHash = await baseClient.sendRawTransaction({
        serializedTransaction: nablaSwapTransaction as `0x${string}`
      });

      const receipt = await baseClient.waitForTransactionReceipt({
        hash: txHash
      });

      if (!receipt || receipt.status !== "success") {
        throw new Error(`NablaSwapExecutor: EVM swap transaction ${txHash} failed`);
      }

      logger.info(`NablaSwapExecutor: EVM swap transaction successful: ${txHash}`);
    } catch (e) {
      logger.error(`Could not swap token on EVM: ${(e as Error).message}`);
      if (e instanceof PhaseError) throw e;
      throw this.createUnrecoverableError(`Could not swap token on EVM: ${(e as Error).message}`);
    }

    return state;
  }

  private async executePendulumSwap(
    state: RampState,
    metadata: ReturnType<typeof getBlockMetadata<typeof NablaSwapContext>>
  ): Promise<RampState> {
    const substrateAddress = state.state.substrateEphemeralAddress;
    if (!substrateAddress || !metadata.inputCurrencyId) throw new Error("NablaSwapExecutor: missing Pendulum data");
    if (state.state.nablaSwapTxHash) return state;
    const manager = ApiManager.getInstance();
    const pendulum = await manager.getApi("pendulum");
    const preparation = getBlockState<{
      softMinimumOutputRaw: string;
      swapExtrinsicOptions: Parameters<typeof createExecuteMessageExtrinsic>[0];
    }>(state.state, NablaSwapContext);
    const dryRun = await createExecuteMessageExtrinsic({
      ...preparation.swapExtrinsicOptions,
      abi: new Abi(routerAbi),
      api: pendulum.api,
      skipDryRunning: false
    });
    if (!dryRun.result || dryRun.result.type !== "success") throw new Error("Could not dry-run Nabla swap");
    const quote = await readMessage({
      abi: new Abi(routerAbi),
      api: pendulum.api,
      callerAddress: substrateAddress,
      contractDeploymentAddress: NABLA_ROUTER,
      limits: defaultReadLimits,
      messageArguments: [metadata.inputAmountForSwapRaw, [metadata.inputToken, metadata.outputToken]],
      messageName: "getAmountOut"
    });
    if (quote.type !== "success" || new Big(quote.value[0].toString()).lt(preparation.softMinimumOutputRaw)) {
      throw this.createRecoverableError("NablaSwapExecutor: estimated Pendulum output is below the soft minimum");
    }
    const presigned = this.getPresignedTransaction(state, "nablaSwap");
    const result = await submitExtrinsic(decodeSubmittableExtrinsic(presigned.txData as string, pendulum.api));
    if (result.status.type === "error") throw new Error("Could not swap token");
    state.state = { ...state.state, nablaSwapTxHash: result.txHash.toString() };
    await state.update({ state: state.state });
    return state;
  }

  private async dryRunEvmSwap(serializedTransaction: `0x${string}`, expectedSender: `0x${string}`): Promise<void> {
    const transaction = parseTransaction(serializedTransaction);
    type RecoverParams = Parameters<typeof recoverTransactionAddress>[0];
    const sender = await recoverTransactionAddress({
      serializedTransaction: serializedTransaction as RecoverParams["serializedTransaction"]
    });
    if (sender.toLowerCase() !== expectedSender.toLowerCase()) {
      throw new Error(`NablaSwapExecutor: sender mismatch. Expected ${expectedSender}, got ${sender}`);
    }
    if (!transaction.to) throw new Error("NablaSwapExecutor: swap transaction has no recipient");
    const call = {
      account: sender,
      blockTag: "pending" as const,
      data: transaction.data,
      gas: transaction.gas,
      to: transaction.to,
      value: transaction.value
    };
    try {
      const baseClient = EvmClientManager.getInstance().getClient(Networks.Base);
      if (transaction.type === "legacy" || transaction.type === undefined) {
        await baseClient.call({ ...call, gasPrice: transaction.gasPrice, type: "legacy" });
      } else if (transaction.type === "eip2930") {
        await baseClient.call({ ...call, accessList: transaction.accessList, gasPrice: transaction.gasPrice, type: "eip2930" });
      } else if (transaction.type === "eip1559") {
        await baseClient.call({
          ...call,
          accessList: transaction.accessList,
          maxFeePerGas: transaction.maxFeePerGas,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
          type: "eip1559"
        });
      } else {
        throw new Error(`Unsupported transaction type ${transaction.type}`);
      }
    } catch (error) {
      throw this.createRecoverableError(`NablaSwapExecutor: EVM swap dry-run failed: ${error}`);
    }
  }
}
