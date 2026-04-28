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

type VrsSignature = { v: number; r: `0x${string}`; s: `0x${string}` };

const permitAbi = [
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
] as const;

const transferFromAbi = [
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
] as const;

function extractPermitFields(permitTypedData: SignedTypedData) {
  const permitMessage = permitTypedData.message;
  return {
    deadline: BigInt(permitMessage.deadline as string),
    owner: permitMessage.owner as `0x${string}`,
    spender: permitMessage.spender as `0x${string}`,
    token: permitTypedData.domain.verifyingContract as `0x${string}`,
    value: BigInt(permitMessage.value as string)
  };
}

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

  private getExecutorClients(fromNetwork: EvmNetworks) {
    const executorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    return {
      publicClient: this.evmClientManager.getClient(fromNetwork),
      walletClient: this.evmClientManager.getWalletClient(fromNetwork, executorAccount)
    };
  }

  private extractSignature(typedData: SignedTypedData, label: string): VrsSignature {
    const sig = typedData.signature as VrsSignature | undefined;
    if (!sig) {
      throw this.createUnrecoverableError(`${label} signature not found`);
    }
    return sig;
  }

  private async saveHashAndAwaitReceipt(
    state: RampState,
    hash: `0x${string}`,
    fromNetwork: EvmNetworks,
    label: string
  ): Promise<RampState> {
    logger.info(`${label} tx sent: ${hash}`);

    const updatedState = await state.update({
      state: { ...state.state, squidRouterPermitExecutionHash: hash }
    });

    const { publicClient } = this.getExecutorClients(fromNetwork);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (!receipt || receipt.status !== "success") {
      throw this.createRecoverableError(`${label} tx failed: ${hash}`);
    }

    logger.info(`${label} tx confirmed: ${hash}`);
    return this.transitionToNextPhase(updatedState, "fundEphemeral");
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
    const permitSig = this.extractSignature(permitTypedData, "Permit");
    const { token, owner, spender, value, deadline } = extractPermitFields(permitTypedData);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;

    const { walletClient, publicClient } = this.getExecutorClients(fromNetwork);

    const permitHash = await walletClient.writeContract({
      abi: permitAbi,
      address: token,
      args: [owner, spender, value, deadline, permitSig.v, permitSig.r, permitSig.s],
      functionName: "permit"
    });
    logger.info(`Direct transfer permit tx sent: ${permitHash}`);

    const permitReceipt = await publicClient.waitForTransactionReceipt({ hash: permitHash });
    if (!permitReceipt || permitReceipt.status !== "success") {
      throw this.createRecoverableError(`Direct transfer permit tx failed: ${permitHash}`);
    }

    const transferHash = await walletClient.writeContract({
      abi: transferFromAbi,
      address: token,
      args: [owner, ephemeralAddress, value],
      functionName: "transferFrom"
    });

    return this.saveHashAndAwaitReceipt(state, transferHash, fromNetwork, "Direct transfer");
  }

  private async executeRelayerTransfer(
    state: RampState,
    signedTypedDataArray: SignedTypedData[],
    fromNetwork: EvmNetworks
  ): Promise<RampState> {
    if (!isSignedTypedDataArray(signedTypedDataArray) || signedTypedDataArray.length !== 2) {
      throw this.createUnrecoverableError("Invalid txData format: expected array of 2 SignedTypedData objects");
    }

    const [permitTypedData, payloadTypedData] = signedTypedDataArray;
    const permitSig = this.extractSignature(permitTypedData, "Permit");
    const payloadSig = this.extractSignature(payloadTypedData, "Payload");
    const { token, owner, value, deadline } = extractPermitFields(permitTypedData);

    const payloadMessage = payloadTypedData.message;
    const payloadData = payloadMessage.data as `0x${string}`;
    const payloadNonce = BigInt(payloadMessage.nonce as string);
    const payloadDeadline = BigInt(payloadMessage.deadline as string);

    const { walletClient } = this.getExecutorClients(fromNetwork);

    const hash = await walletClient.writeContract({
      abi: tokenRelayerAbi,
      address: RELAYER_ADDRESS as `0x${string}`,
      args: [
        {
          deadline,
          owner,
          payloadData,
          payloadDeadline,
          payloadNonce,
          payloadR: payloadSig.r,
          payloadS: payloadSig.s,
          payloadV: payloadSig.v,
          payloadValue: state.state.squidRouterPermitExecutionValue,
          permitR: permitSig.r,
          permitS: permitSig.s,
          permitV: permitSig.v,
          token,
          value
        }
      ],
      functionName: "execute",
      value: BigInt(state.state.squidRouterPermitExecutionValue!)
    });

    return this.saveHashAndAwaitReceipt(state, hash, fromNetwork, "Relayer execute");
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

      return await this.executeRelayerTransfer(state, signedTypedDataArray, fromNetwork);
    } catch (error) {
      logger.error(`Error in squidRouterPermitExecute phase for ramp ${state.id}:`, error);

      if (error instanceof PhaseError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw this.createRecoverableError(`SquidrouterPermitExecuteHandler: ${errorMessage}`);
    }
  }
}

export default new SquidrouterPermitExecuteHandler();
