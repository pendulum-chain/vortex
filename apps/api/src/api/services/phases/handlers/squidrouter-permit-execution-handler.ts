import { isSignedTypedDataArray } from "@packages/shared";
import {
  EvmClientManager,
  getNetworkFromDestination,
  isNetworkEVM,
  Networks,
  RampPhase,
  SignedTypedData
} from "@vortexfi/shared";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MOONBEAM_EXECUTOR_PRIVATE_KEY } from "../../../../constants/constants";
import { tokenRelayerAbi } from "../../../../contracts/TokenRelayer";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { RELAYER_ADDRESS } from "../../transactions/offramp/routes/evm-to-alfredpay";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

// Phase description: call the relayer contract's `execute` function with both the token permit and
// the signed squidrouter call.
export class SquidrouterPermitExecuteHandler extends BasePhaseHandler {
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
  }

  public getPhaseName(): RampPhase {
    return "squidrouterPermitExecute";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidrouterPermitExecute phase for ramp ${state.id}`);

    const fromNetwork = getNetworkFromDestination(state.from);

    if (!fromNetwork || !isNetworkEVM(fromNetwork)) {
      throw this.createUnrecoverableError(`Unsupported network for squidrouterPermitExecute phase: ${state.from}`);
    }

    try {
      const existingHash = state.state.squidrouterPermitExecutionHash || null;

      if (existingHash) {
        logger.info(`Found existing squidrouter permit execution hash for ramp ${state.id}: ${existingHash}`);

        try {
          const publicClient = this.evmClientManager.getClient(fromNetwork);
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: existingHash as `0x${string}`
          });

          if (receipt && receipt.status === "success") {
            logger.info(`Existing squidrouter permit execution transaction was successful for ramp ${state.id}`);
            return this.transitionToNextPhase(state, "fundEphemeral");
          } else {
            logger.info(
              `Existing squidrouter permit execution transaction was not successful (status: ${receipt?.status}), will retry`
            );
          }
        } catch (error) {
          logger.info(`Could not verify existing transaction status: ${error}, will retry`);
        }
      }

      const permitExecuteTransaction = this.getPresignedTransaction(state, "squidrouterPermitExecute");
      if (!permitExecuteTransaction) {
        throw this.createUnrecoverableError("Missing presigned transaction for squidrouterPermitExecute phase");
      }

      // For this special phase, txData is of type SignedTypedData[], where the first element is the permit typed data and the second element is the payload typed data
      const signedTypedDataArray = permitExecuteTransaction.txData as SignedTypedData[];
      if (!isSignedTypedDataArray(signedTypedDataArray) || signedTypedDataArray.length !== 2) {
        throw this.createUnrecoverableError("Invalid txData format: expected array of 2 SignedTypedData objects");
      }

      const [permitTypedData, payloadTypedData] = signedTypedDataArray;

      const permitSignature = permitTypedData.signature;
      if (!permitSignature) {
        throw this.createUnrecoverableError("Permit signature not found or invalid format");
      }
      const permitSig = permitSignature as { v: number; r: `0x${string}`; s: `0x${string}` };
      const { v: permitV, r: permitR, s: permitS } = permitSig;

      const payloadSignature = payloadTypedData.signature;
      if (!payloadSignature) {
        throw this.createUnrecoverableError("Payload signature not found or invalid format");
      }
      const payloadSig = payloadSignature as { v: number; r: `0x${string}`; s: `0x${string}` };
      const { v: payloadV, r: payloadR, s: payloadS } = payloadSig;

      const permitMessage = permitTypedData.message;
      const token = permitTypedData.domain.verifyingContract as `0x${string}`;
      const owner = permitMessage.owner as `0x${string}`;
      const value = BigInt(permitMessage.value as string);
      const deadline = BigInt(permitMessage.deadline as string);

      const payloadMessage = payloadTypedData.message;
      const payloadData = payloadMessage.data as `0x${string}`;
      const payloadNonce = BigInt(payloadMessage.nonce as string);
      const payloadDeadline = BigInt(payloadMessage.deadline as string);

      const relayerAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
      const walletClient = this.evmClientManager.getWalletClient(fromNetwork, relayerAccount);

      const hash = await walletClient.writeContract({
        abi: tokenRelayerAbi,
        address: RELAYER_ADDRESS as `0x${string}`,
        args: [
          {
            deadline: deadline,
            owner: owner,
            payloadData: payloadData,
            payloadDeadline: payloadDeadline,
            payloadNonce: payloadNonce,
            payloadR: payloadR,
            payloadS: payloadS,
            payloadV: payloadV,
            payloadValue: state.state.squidRouterPermitExecutionValue,
            permitR: permitR,
            permitS: permitS,
            permitV: permitV,
            token: token,
            value: value
          }
        ],
        functionName: "execute",
        value: BigInt(state.state.squidRouterPermitExecutionValue!)
      });

      logger.info(`Relayer execute transaction sent with hash: ${hash}`);

      const updatedState = await state.update({
        state: {
          ...state.state,
          squidrouterPermitExecutionHash: hash
        }
      });

      const publicClient = this.evmClientManager.getClient(fromNetwork);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`
      });

      if (!receipt || receipt.status !== "success") {
        throw this.createRecoverableError(`Relayer execute transaction failed: ${hash}`);
      }

      logger.info(`Relayer execute transaction confirmed: ${hash}`);

      return this.transitionToNextPhase(updatedState, "fundEphemeral");
    } catch (error) {
      logger.error(`Error in squidrouterPermitExecute phase for ramp ${state.id}:`, error);

      if (error instanceof PhaseError) {
        throw error;
      }

      // Default to recoverable error
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw this.createRecoverableError(`SquidrouterPermitExecuteHandler: ${errorMessage}`);
    }
  }
}

export default new SquidrouterPermitExecuteHandler();
