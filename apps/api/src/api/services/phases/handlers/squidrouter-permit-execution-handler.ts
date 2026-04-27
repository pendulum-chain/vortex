import {
  EvmClientManager,
  EvmNetworks,
  getNetworkFromDestination,
  isNetworkEVM,
  isSignedTypedDataArray,
  RampPhase,
  SignedTypedData
} from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MOONBEAM_EXECUTOR_PRIVATE_KEY } from "../../../../constants/constants";
import { tokenRelayerAbi } from "../../../../contracts/TokenRelayer";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { RELAYER_ADDRESS } from "../../transactions/offramp/routes/evm-to-alfredpay";
import { BasePhaseHandler } from "../base-phase-handler";

// Phase description: call the relayer contract's `execute` function with both the token permit and
// the signed squidrouter call.
export class SquidrouterPermitExecuteHandler extends BasePhaseHandler {
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
  }

  public getPhaseName(): RampPhase {
    return "squidRouterPermitExecute";
  }

  private async executeDirectTransfer(
    state: RampState,
    signedTypedDataArray: SignedTypedData[],
    fromNetwork: EvmNetworks
  ): Promise<RampState> {
    if (!isSignedTypedDataArray(signedTypedDataArray) || signedTypedDataArray.length !== 1) {
      throw this.createUnrecoverableError("Invalid txData format for direct transfer: expected array of 1 SignedTypedData");
    }

    const [permitTypedData] = signedTypedDataArray;
    const permitSignature = permitTypedData.signature as { v: number; r: `0x${string}`; s: `0x${string}` } | undefined;
    if (!permitSignature) {
      throw this.createUnrecoverableError("Permit signature not found for direct transfer");
    }

    const permitMessage = permitTypedData.message;
    const token = permitTypedData.domain.verifyingContract as `0x${string}`;
    const owner = permitMessage.owner as `0x${string}`;
    const spender = permitMessage.spender as `0x${string}`;
    const value = BigInt(permitMessage.value as string);
    const deadline = BigInt(permitMessage.deadline as string);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;

    const executorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const walletClient = this.evmClientManager.getWalletClient(fromNetwork, executorAccount);
    const publicClient = this.evmClientManager.getClient(fromNetwork);

    const permitHash = await walletClient.writeContract({
      abi: [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "v", type: "uint8" },
            { name: "r", type: "bytes32" },
            { name: "s", type: "bytes32" }
          ],
          name: "permit",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ] as const,
      address: token,
      args: [owner, spender, value, deadline, permitSignature.v, permitSignature.r, permitSignature.s],
      functionName: "permit"
    });
    logger.info(`Direct transfer permit tx sent: ${permitHash}`);

    const permitReceipt = await publicClient.waitForTransactionReceipt({ hash: permitHash });
    if (!permitReceipt || permitReceipt.status !== "success") {
      throw this.createRecoverableError(`Direct transfer permit tx failed: ${permitHash}`);
    }

    const transferHash = await walletClient.writeContract({
      abi: [
        {
          inputs: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function"
        }
      ] as const,
      address: token,
      args: [owner, ephemeralAddress, value],
      functionName: "transferFrom"
    });
    logger.info(`Direct transfer transferFrom tx sent: ${transferHash}`);

    const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
    if (!transferReceipt || transferReceipt.status !== "success") {
      throw this.createRecoverableError(`Direct transfer transferFrom tx failed: ${transferHash}`);
    }

    const updatedState = await state.update({
      state: {
        ...state.state,
        squidRouterPermitExecutionHash: transferHash
      }
    });

    logger.info(`Direct transfer completed for ramp ${state.id}`);
    return this.transitionToNextPhase(updatedState, "fundEphemeral");
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouterPermitExecute phase for ramp ${state.id}`);

    const fromNetwork = getNetworkFromDestination(state.from);

    if (!fromNetwork || !isNetworkEVM(fromNetwork)) {
      throw this.createUnrecoverableError(`Unsupported network for squidRouterPermitExecute phase: ${state.from}`);
    }

    try {
      const existingHash = state.state.squidRouterPermitExecutionHash || null;

      if (existingHash) {
        logger.info(`Found existing squidRouter permit execution hash for ramp ${state.id}: ${existingHash}`);

        try {
          const publicClient = this.evmClientManager.getClient(fromNetwork);
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: existingHash as `0x${string}`
          });

          if (receipt && receipt.status === "success") {
            logger.info(`Existing squidRouter permit execution transaction was successful for ramp ${state.id}`);
            return this.transitionToNextPhase(state, "fundEphemeral");
          } else {
            logger.info(
              `Existing squidRouter permit execution transaction was not successful (status: ${receipt?.status}), will retry`
            );
          }
        } catch (error) {
          logger.info(`Could not verify existing transaction status: ${error}, will retry`);
        }
      }

      const permitExecuteTransaction = this.getPresignedTransaction(state, "squidRouterPermitExecute");
      if (!permitExecuteTransaction) {
        throw this.createUnrecoverableError("Missing presigned transaction for squidRouterPermitExecute phase");
      }

      const signedTypedDataArray = permitExecuteTransaction.txData as SignedTypedData[];

      if (state.state.isDirectTransfer) {
        return await this.executeDirectTransfer(state, signedTypedDataArray, fromNetwork);
      }

      // For this special phase, txData is of type SignedTypedData[], where the first element is the permit typed data and the second element is the payload typed data
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
          squidRouterPermitExecutionHash: hash
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
      logger.error(`Error in squidRouterPermitExecute phase for ramp ${state.id}:`, error);

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
