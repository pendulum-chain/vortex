import { CleanupPhase, EvmClientManager, Networks, PresignedTx } from "@vortexfi/shared";
import { Transaction as EvmTransaction } from "ethers";
import { erc20Abi } from "viem";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { getEvmFundingAccount } from "../evm-funding";
import { BasePostProcessHandler } from "./base-post-process-handler";

const BASE_CLEANUP_PHASES: CleanupPhase[] = ["baseCleanupBrla", "baseCleanupUsdc"];

export class BaseChainPostProcessHandler extends BasePostProcessHandler {
  public getCleanupName(): CleanupPhase {
    return "baseCleanupBrla";
  }

  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    return BASE_CLEANUP_PHASES.some(phase => this.getPresignedTransaction(state, phase) !== undefined);
  }

  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const ephemeralAddress = state.state.evmEphemeralAddress;
    if (!ephemeralAddress) {
      return [false, this.createErrorObject("No EVM ephemeral address found in state")];
    }

    for (const phase of BASE_CLEANUP_PHASES) {
      const presignedTx = this.getPresignedTransaction(state, phase);
      if (!presignedTx) {
        continue;
      }

      const [ok, err] = await this.sweepToken(state, ephemeralAddress as `0x${string}`, presignedTx, phase);
      if (!ok) {
        return [false, err];
      }
    }

    return [true, null];
  }

  private async sweepToken(
    state: RampState,
    ephemeralAddress: `0x${string}`,
    presignedTx: PresignedTx,
    phase: CleanupPhase
  ): Promise<[boolean, Error | null]> {
    try {
      const signedApproveTx = presignedTx.txData as string;
      const parsedTx = EvmTransaction.from(signedApproveTx);
      const tokenAddress = parsedTx.to as `0x${string}`;
      if (!tokenAddress) {
        return [false, this.createErrorObject(`Could not extract token address from presigned ${phase} tx`)];
      }

      const evmClientManager = EvmClientManager.getInstance();
      const publicClient = evmClientManager.getClient(Networks.Base);

      const balance = await publicClient.readContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ephemeralAddress],
        functionName: "balanceOf"
      });

      if (balance === 0n) {
        logger.info(`Base cleanup ${phase} for ramp ${state.id}: ephemeral has zero balance, skipping`);
        return [true, null];
      }

      const txHash = await evmClientManager.sendRawTransactionWithRetry(Networks.Base, signedApproveTx as `0x${string}`);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!approveReceipt || approveReceipt.status !== "success") {
        return [false, this.createErrorObject(`Approve tx ${txHash} for ${phase} failed`)];
      }

      const fundingAccount = getEvmFundingAccount(Networks.Base);
      const walletClient = evmClientManager.getWalletClient(Networks.Base, fundingAccount);

      const transferFromHash = await walletClient.writeContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ephemeralAddress, fundingAccount.address, balance],
        functionName: "transferFrom"
      });

      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferFromHash });
      if (!transferReceipt || transferReceipt.status !== "success") {
        return [false, this.createErrorObject(`transferFrom tx ${transferFromHash} for ${phase} failed`)];
      }

      logger.info(`Successfully swept ${balance} tokens for Base cleanup ${phase} on ramp ${state.id}`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Error in Base cleanup ${phase}: ${e}`)];
    }
  }
}

export default new BaseChainPostProcessHandler();
