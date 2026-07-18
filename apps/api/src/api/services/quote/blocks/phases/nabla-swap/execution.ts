import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmToken,
  EvmTokenDetails,
  evmTokenConfig,
  getOnChainTokenDetails,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import { Big } from "big.js";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";

// EVM slice of the production NablaApprovePhaseHandler: broadcasts the presigned ERC-20 approve
// for the Nabla router on Base. The substrate (Pendulum) branch is not ported.
export class NablaApproveExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "nablaApprove";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
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

    if (!quote.metadata.nablaSwapEvm?.inputAmountForSwapRaw || !quote.metadata.nablaSwapEvm.inputCurrency) {
      throw new Error("Missing nablaSwapEvm input metadata required to validate pre-swap balance");
    }

    const evmEphemeralAddress = state.state.evmEphemeralAddress;
    if (!evmEphemeralAddress) {
      throw new Error("Missing EVM ephemeral address to validate nabla swap input balance");
    }

    const inputTokenDetails = evmTokenConfig[Networks.Base]?.[quote.metadata.nablaSwapEvm.inputCurrency as EvmToken] as
      | EvmTokenDetails
      | undefined;
    if (!inputTokenDetails) {
      throw new Error(`Invalid input token ${quote.metadata.nablaSwapEvm.inputCurrency} for Base nabla swap`);
    }

    try {
      await checkEvmBalanceForToken({
        amountDesiredRaw: quote.metadata.nablaSwapEvm.inputAmountForSwapRaw,
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
      throw this.createUnrecoverableError(`Could not swap token on EVM: ${(e as Error).message}`);
    }

    return state;
  }
}
