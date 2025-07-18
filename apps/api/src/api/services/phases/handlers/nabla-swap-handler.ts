import { decodeSubmittableExtrinsic, NABLA_ROUTER, RampPhase } from "@packages/shared";
import {
  createExecuteMessageExtrinsic,
  ExecuteMessageResult,
  ReadMessageResult,
  readMessage,
  submitExtrinsic
} from "@pendulum-chain/api-solang";
import { Abi } from "@polkadot/api-contract";
import Big from "big.js";
import logger from "../../../../config/logger";
import { routerAbi } from "../../../../contracts/Router";
import RampState from "../../../../models/rampState.model";
import { defaultReadLimits } from "../../../helpers/contracts";
import { ApiManager } from "../../pendulum/apiManager";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class NablaSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "nablaSwap";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const {
      nablaSoftMinimumOutputRaw,
      pendulumEphemeralAddress,
      inputAmountBeforeSwapRaw,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails
    } = state.state as StateMetadata;

    if (
      !nablaSoftMinimumOutputRaw ||
      !pendulumEphemeralAddress ||
      !inputAmountBeforeSwapRaw ||
      !inputTokenPendulumDetails ||
      !outputTokenPendulumDetails
    ) {
      throw new Error("State metadata is corrupt, missing values. This is a bug.");
    }

    try {
      const { txData: nablaSwapTransaction } = this.getPresignedTransaction(state, "nablaSwap");
      // This is a new item that might not be available on old states.
      const swapExtrinsicOptions = state.state.nabla?.swapExtrinsicOptions;

      if (swapExtrinsicOptions) {
        // Do a dry-run with the extrinsic options we used to create the presigned extrinsic.
        const { result: readMessageResult } = await createExecuteMessageExtrinsic({
          ...swapExtrinsicOptions,
          abi: new Abi(routerAbi),
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

      // Get up-to-date quote and compare it to the soft minimum output.
      const response = await readMessage({
        abi: new Abi(routerAbi),
        api: pendulumNode.api,
        callerAddress: pendulumEphemeralAddress,
        contractDeploymentAddress: NABLA_ROUTER,
        limits: defaultReadLimits,
        messageArguments: [
          inputAmountBeforeSwapRaw,
          [inputTokenPendulumDetails.erc20WrapperAddress, outputTokenPendulumDetails.erc20WrapperAddress]
        ],
        messageName: "getAmountOut"
      });
      if (response.type !== "success") {
        throw new Error("Couldn't get a quote from the AMM");
      }

      const ouputAmountQuoteRaw = Big(response.value[0].toString());
      if (ouputAmountQuoteRaw.lt(Big(nablaSoftMinimumOutputRaw))) {
        logger.info(
          `The estimated output amount is too low to swap. Expected: ${nablaSoftMinimumOutputRaw}, got: ${ouputAmountQuoteRaw}`
        );
        throw new Error("Won't execute the swap now. The estimated output amount is too low.");
      }

      if (typeof nablaSwapTransaction !== "string") {
        throw new Error("NablaSwapPhaseHandler: Presigned transaction is not a string -> not an encoded Nabla transaction.");
      }

      const swapExtrinsic = decodeSubmittableExtrinsic(nablaSwapTransaction, pendulumNode.api);
      const result = await submitExtrinsic(swapExtrinsic);

      if (result.status.type === "error") {
        logger.error(`Could not swap token: ${result.status.error.toString()}`);
        throw new Error("Could not swap token");
      }
    } catch (e) {
      let errorMessage = "";
      const { result } = e as ExecuteMessageResult;
      if (result?.type === "reverted") {
        errorMessage = result.description;
      } else if (result?.type === "error") {
        errorMessage = result.error;
      } else {
        errorMessage = (e as string).toString();
      }

      throw new Error(`Could not swap the required amount of token: ${errorMessage}`);
    }

    const nextPhase = state.type === "on" ? "distributeFees" : "subsidizePostSwap";
    return this.transitionToNextPhase(state, nextPhase);
  }
}

export default new NablaSwapPhaseHandler();
