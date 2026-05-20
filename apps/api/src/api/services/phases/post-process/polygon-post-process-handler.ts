import { CleanupPhase, EvmClientManager, EvmNetworks, Networks, PresignedTx, RampDirection } from "@vortexfi/shared";
import { Transaction as EvmTransaction } from "ethers";
import { erc20Abi } from "viem";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import RampState from "../../../../models/rampState.model";
import { getEvmFundingAccount } from "../evm-funding";
import { BasePostProcessHandler } from "./base-post-process-handler";

const POLYGON_BUY_CLEANUP_PHASES: CleanupPhase[] = ["polygonCleanup"];
const POLYGON_SELL_CLEANUP_PHASES: CleanupPhase[] = ["polygonCleanupAxlUsdc"];

export class PolygonPostProcessHandler extends BasePostProcessHandler {
  public getCleanupName(): CleanupPhase {
    return "polygonCleanup";
  }

  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    return this.cleanupPhasesFor(state).some(phase => this.getPresignedTransaction(state, phase) !== undefined);
  }

  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const ephemeralAddress = state.state.evmEphemeralAddress;
    if (!ephemeralAddress) {
      return [false, this.createErrorObject("No EVM ephemeral address found in state")];
    }

    const polygonNetwork: EvmNetworks = config.sandboxEnabled ? Networks.PolygonAmoy : Networks.Polygon;

    for (const phase of this.cleanupPhasesFor(state)) {
      const presignedTx = this.getPresignedTransaction(state, phase);
      if (!presignedTx) {
        continue;
      }

      const [ok, err] = await this.sweepToken(state, ephemeralAddress as `0x${string}`, presignedTx, phase, polygonNetwork);
      if (!ok) {
        return [false, err];
      }
    }

    return [true, null];
  }

  private cleanupPhasesFor(state: RampState): CleanupPhase[] {
    return state.type === RampDirection.BUY ? POLYGON_BUY_CLEANUP_PHASES : POLYGON_SELL_CLEANUP_PHASES;
  }

  private async sweepToken(
    state: RampState,
    ephemeralAddress: `0x${string}`,
    presignedTx: PresignedTx,
    phase: CleanupPhase,
    polygonNetwork: EvmNetworks
  ): Promise<[boolean, Error | null]> {
    try {
      const signedApproveTx = presignedTx.txData as string;
      const parsedTx = EvmTransaction.from(signedApproveTx);
      const tokenAddress = parsedTx.to as `0x${string}`;
      if (!tokenAddress) {
        return [false, this.createErrorObject(`Could not extract token address from presigned ${phase} tx`)];
      }

      const evmClientManager = EvmClientManager.getInstance();
      const publicClient = evmClientManager.getClient(polygonNetwork);

      const balance = await publicClient.readContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ephemeralAddress],
        functionName: "balanceOf"
      });

      if (balance === 0n) {
        logger.info(`Polygon cleanup ${phase} for ramp ${state.id}: ephemeral has zero balance, skipping`);
        return [true, null];
      }

      const txHash = await evmClientManager.sendRawTransactionWithRetry(polygonNetwork, signedApproveTx as `0x${string}`);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!approveReceipt || approveReceipt.status !== "success") {
        return [false, this.createErrorObject(`Approve tx ${txHash} for ${phase} failed`)];
      }

      const fundingAccount = getEvmFundingAccount(polygonNetwork);
      const walletClient = evmClientManager.getWalletClient(polygonNetwork, fundingAccount);

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

      logger.info(`Successfully swept ${balance} tokens for Polygon cleanup ${phase} on ramp ${state.id}`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Error in Polygon cleanup ${phase}: ${e}`)];
    }
  }
}

export default new PolygonPostProcessHandler();
