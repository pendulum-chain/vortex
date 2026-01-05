import { createExecuteMessageExtrinsic, ExecuteMessageResult, submitExtrinsic } from "@pendulum-chain/api-solang";
import { Abi } from "@polkadot/api-contract";
import { ApiManager, decodeSubmittableExtrinsic, NABLA_ROUTER, RampPhase } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import { erc20WrapperAbi } from "../../../../contracts/ERC20Wrapper";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

export class NablaApprovePhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "nablaApprove";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const quote = await QuoteTicket.findByPk(state.quoteId);

    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.nablaSwap) {
      throw new Error("Missing nablaSwap info in quote metadata");
    }

    try {
      const approval = await pendulumNode.api.query.tokenAllowance.approvals(
        quote.metadata.nablaSwap.inputCurrencyId,
        state.state.substrateEphemeralAddress,
        NABLA_ROUTER
      );
      const requiredAmount = new Big(quote.metadata.nablaSwap.inputAmountForSwapRaw);
      const approvedAmount = approval.toString() !== "" ? Big(approval.toString()) : Big(0);
      if (approvedAmount.gte(requiredAmount)) {
        logger.info("NablaApprovePhaseHandler: Amount already approved. Skipping approval.");
        return this.transitionToNextPhase(state, "nablaSwap");
      }
    } catch (e) {
      throw this.createRecoverableError(
        `NablaApprovePhaseHandler: Could not check if the approve has already been performed. ${(e as Error).message}`
      );
    }

    try {
      const { txData: nablaApproveTransaction } = this.getPresignedTransaction(state, "nablaApprove");
      // This is a new item that might not be available on old states.
      const approveExtrinsicOptions = state.state.nabla?.approveExtrinsicOptions;

      if (approveExtrinsicOptions) {
        const { api } = pendulumNode;
        const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());

        // Do a dry-run with the extrinsic options we used to create the presigned extrinsic.
        const { result: readMessageResult } = await createExecuteMessageExtrinsic({
          ...approveExtrinsicOptions,
          abi: erc20ContractAbi,
          api: pendulumNode.api,
          skipDryRunning: false
        });

        if (!readMessageResult) {
          throw new Error("Could not dry-run nabla swap transaction. Missing result.");
        }
        if (readMessageResult.type !== "success") {
          const errorMessage = this.parseContractMessageResultError(readMessageResult);
          throw new Error("Could not dry-run nabla swap transaction: " + errorMessage);
        }
      }

      if (typeof nablaApproveTransaction !== "string") {
        throw new Error("NablaApprovePhaseHandler: Invalid transaction data. This is a bug.");
      }
      const approvalExtrinsic = decodeSubmittableExtrinsic(nablaApproveTransaction, pendulumNode.api);
      const result = await submitExtrinsic(approvalExtrinsic);

      if (result.status.type === "error") {
        logger.error(`Could not approve token: ${result.status.error.toString()}`);
        throw new Error("Could not approve token");
      }

      return this.transitionToNextPhase(state, "nablaSwap");
    } catch (e) {
      let errorMessage = "";
      const { result } = e as ExecuteMessageResult;
      if (result?.type === "reverted") {
        errorMessage = result.description;
      } else if (result?.type === "error") {
        errorMessage = result.error;
      } else {
        errorMessage = "Something went wrong";
      }
      logger.error(`Could not approve the required amount of token: ${errorMessage}`);

      throw e;
    }
  }
}

export default new NablaApprovePhaseHandler();
